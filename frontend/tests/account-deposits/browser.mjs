import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const executable = process.env.TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable) throw new Error('Set TEST_BROWSER to a Chromium executable.');
const profile = mkdtempSync(resolve(tmpdir(), 'account-deposits-'));
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
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/account-deposits/index.html` });
  await waitFor("document.querySelector('tbody')?.textContent.includes('LEASE-001')");
  assert.match(await evaluate('document.title'), /Security Deposit Liability/);
  assert.ok(await evaluate("(() => { const page = document.querySelector('.app-page'); const panel = document.querySelector('.index-panel'); return Math.abs(panel.getBoundingClientRect().bottom - (page.getBoundingClientRect().bottom - parseFloat(getComputedStyle(page).paddingBottom))) <= 2; })()"), 'Deposit panel fills the page down to the standard bottom gutter');
  await click('th[data-sort="summary.requiredDeposit"]');
  assert.equal(await evaluate("document.querySelector('th[data-sort=\"summary.requiredDeposit\"]').getAttribute('aria-sort')"), 'ascending');
  await click('th[data-sort="summary.requiredDeposit"]');
  assert.equal(await evaluate("document.querySelector('th[data-sort=\"summary.requiredDeposit\"]').getAttribute('aria-sort')"), 'descending');
  for (const language of ['en', 'fa']) {
    await evaluate(`window.setTestLanguage(${JSON.stringify(language)})`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await pause(50);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 375'), 'Table scrolls inside the page on mobile');
    assert.ok(await evaluate("(() => { const action = document.querySelector('.actions-cell').getBoundingClientRect(); const wrap = document.querySelector('.data-table-wrap').getBoundingClientRect(); return action.left >= wrap.left - 1 && action.right <= wrap.right + 1; })()"), 'Actions visible in both directions');
    assert.ok(await evaluate("[...document.querySelectorAll('tbody .amount-cell')].every(cell => cell.scrollWidth <= cell.clientWidth + 1)"), 'Amounts stay readable');
  }
  await evaluate("window.setTestLanguage('en')");
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('.row-actions-trigger');
  assert.equal(await evaluate("document.querySelectorAll('.row-menu-item').length"), 2);
  assert.equal(await evaluate("document.querySelector('a.row-menu-item').getAttribute('href')"), '#/tenants/tenant-1');
  await click('button.row-menu-item');
  await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('LEASE-001')");
  assert.equal(await evaluate('location.hash'), '#/accounts/deposit-account', 'Popup stays on the account');
  await evaluate("(() => { const field = document.querySelector('#transaction-amount'); field.value = '100'; field.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.transaction-form form').requestSubmit(); })()");
  await waitFor("document.querySelector('.hero-balance strong')?.textContent.includes('100.00')");
  await click('.btn-close');
  await waitFor("!document.querySelector('[role=dialog]')");
  await click('.row-actions-trigger');
  await click('a.row-menu-item');
  await waitFor("location.hash === '#/tenants/tenant-1'");
  await evaluate("location.hash = '#/accounts/deposit-account?tab=ledger'");
  await waitFor("Boolean(document.querySelector('#account-ledger')) && !document.querySelector('.identity-hero') && !document.querySelector('.index-page')");
  for (const tab of ['ledger', 'statement', 'annual', 'documents']) {
    await evaluate(`location.hash = '#/accounts/deposit-account?tab=${tab}'`);
    await waitFor(`Boolean(document.querySelector('#account-${tab}'))`);
    assert.ok(await evaluate("(() => { const page = document.querySelector('.app-page'); const card = document.querySelector('.record-card'); return Math.abs(card.getBoundingClientRect().bottom - (page.getBoundingClientRect().bottom - parseFloat(getComputedStyle(page).paddingBottom))) <= 2; })()"), `${tab} card fills the remaining page height`);
  }
  await evaluate("location.hash = '#/accounts/deposit-account'");
  await waitFor("document.querySelector('tbody')?.textContent.includes('LEASE-001')");
  await evaluate("location.hash = '#/accounts/cash-account'; window.showCashAccount()");
  await waitFor("Boolean(document.querySelector('.identity-hero')) && !document.querySelector('.index-page')");
  console.log('Passed: deposit account lists deposits, two actions, deposit popup, transaction refresh, tenant navigation, overview-only visibility, and other accounts excluded.');
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
