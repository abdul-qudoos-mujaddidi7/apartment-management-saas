import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const executable = process.env.TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable) throw new Error('Set TEST_BROWSER to a Chromium executable.');
const profile = mkdtempSync(resolve(tmpdir(), 'journals-'));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, send;
try {
  await server.listen();
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const portFile = resolve(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await pause(100);
  const debugPort = readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') console.log('Browser error:', message.params.exceptionDetails);
    if (!message.id) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(new Error(message.error.message)); else request?.resolve(message.result);
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser timeout: ' + method)); }, 8000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(100); }
    assert.fail('Timed out: ' + expression);
  }
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(50); };
  const rowFor = journalNumber => `[...document.querySelectorAll('tbody tr')].find(row => row.textContent.includes(${JSON.stringify(journalNumber)}))`;
  /* The menu is a real one: it stays open behind the dialog it opened, so every
     step puts the row back to rest before reaching for the next control. */
  const closeRowMenu = async () => {
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await waitFor("!document.querySelector('.row-actions-menu')");
  };
  const openRowMenu = async journalNumber => {
    if (await evaluate("Boolean(document.querySelector('.row-actions-menu'))")) await closeRowMenu();
    await evaluate(`(${rowFor(journalNumber)}).querySelector('.row-actions-trigger').click()`);
    await waitFor("Boolean(document.querySelector('.row-actions-menu'))");
    await pause(50);
  };
  // Escape would also dismiss the dialog the action just opened, so the menu is
  // left where it is and the next `openRowMenu` puts the row back to rest.
  const chooseAction = async label => {
    await evaluate(`[...document.querySelectorAll('.row-menu-item')].find(item => item.textContent.includes(${JSON.stringify(label)})).click()`);
    await pause(100);
  };

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/journals/index.html` });
  await waitFor("document.querySelector('tbody')?.textContent.includes('JRN-000002')");

  // The register lists both entries with their totals.
  assert.match(await evaluate("document.querySelector('tbody').textContent"), /100\.00/);
  assert.match(await evaluate("document.querySelector('tbody').textContent"), /20\.00/);

  // A hand-written entry can be read, corrected and reversed; a document posting
  // can only be read, because the document that owns it is where it is corrected.
  await openRowMenu('JRN-000002');
  const manualActions = await evaluate("[...document.querySelectorAll('.row-menu-item')].map(item => item.textContent.trim())");
  assert.deepEqual(manualActions, ['View', 'Edit', 'Void']);
  await chooseAction('View');
  await waitFor("Boolean(document.querySelector('.journal-lines-table'))");
  assert.match(await evaluate("document.querySelector('.journal-lines-table').textContent"), /Accounts receivable · Sample tenant/);
  assert.match(await evaluate("document.querySelector('.journal-details').textContent"), /Manual entry/);
  await click('.btn-close');
  await waitFor("!document.querySelector('.journal-lines-table')");

  await openRowMenu('JRN-000002');
  await chooseAction('Edit');
  await waitFor("Boolean(document.querySelector('#journal-entry-form'))");
  assert.equal(await evaluate("document.querySelector('.modal-title').textContent.trim()"), 'Edit journal entry');
  assert.equal(await evaluate("document.querySelectorAll('#journal-entry-form .journal-lines-table tbody tr').length"), 2);
  assert.equal(await evaluate("document.querySelector('#journal-entry-form .journal-lines-table tbody tr:first-child select').value"), 'tenant:tenant');
  await click('.modal .btn-close');
  await waitFor("!document.querySelector('#journal-entry-form')");

  await openRowMenu('JRN-000002');
  await chooseAction('Void');
  await waitFor("Boolean(document.querySelector('#void-journal-form'))");
  await evaluate("document.querySelector('#void-journal-reason').value = 'Wrong account'; document.querySelector('#void-journal-reason').dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#void-journal-form').requestSubmit();");
  await waitFor("window.writes.some(entry => entry === 'POST /api/journals/journal-2/void')");
  assert.equal(await evaluate("Boolean(document.querySelector('#void-journal-form'))"), false, 'The void dialog closes once the entry is reversed');
  const reloads = await evaluate("window.requests.filter(url => url.startsWith('/api/journals')).length");
  assert.ok(reloads >= 2, 'The register re-reads after a void');

  await openRowMenu('JRN-000001');
  const documentActions = await evaluate("[...document.querySelectorAll('.row-menu-item')].map(item => item.textContent.trim())");
  assert.deepEqual(documentActions, ['View']);
  await chooseAction('View');
  await waitFor("Boolean(document.querySelector('.journal-lines-table'))");
  assert.match(await evaluate("document.querySelector('.journal-details').textContent"), /Invoice/);
  await click('.btn-close');
  await waitFor("!document.querySelector('.journal-lines-table')");

  // A new entry opens an empty, balanced form; the register's own filter re-reads.
  await click('.add-button');
  await waitFor("Boolean(document.querySelector('#journal-entry-form'))");
  assert.equal(await evaluate("document.querySelector('.modal-title').textContent.trim()"), 'New journal entry');
  assert.equal(await evaluate("document.querySelector('#journal-entry-form .journal-lines-table tbody tr:first-child select').value"), '', 'A new entry starts untagged');
  await click('.modal .btn-close');
  await waitFor("!document.querySelector('#journal-entry-form')");

  await click('.filters-button');
  await waitFor("Boolean(document.querySelector('#journal-filter-status'))");
  await evaluate("const select = document.querySelector('#journal-filter-status'); select.value = 'VOIDED'; select.dispatchEvent(new Event('change', { bubbles: true }));");
  await waitFor("window.requests.some(url => url.startsWith('/api/journals') && url.includes('status=VOIDED'))");
  await waitFor("document.querySelector('.empty-state')");
  assert.match(await evaluate("document.querySelector('.empty-state').textContent"), /No journal entries yet/);

  console.log('Passed: register list, view/edit/void row actions, document postings read-only, totals, new-entry form and status filter.');
} finally {
  if (socket?.readyState === WebSocket.OPEN && send) { await send('Browser.close').catch(() => {}); socket.close(); }
  browser?.kill();
  await server.close();
  const withinTemp = relative(resolve(tmpdir()), resolve(profile));
  if (withinTemp && !withinTemp.startsWith('..') && !withinTemp.includes(':')) {
    await pause(300);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { /* Browser may still be releasing its profile. */ }
  }
}
