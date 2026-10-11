import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const executable = process.env.TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable) throw new Error('Set TEST_BROWSER to a Chromium executable.');
const profile = mkdtempSync(resolve(tmpdir(), 'tenant-account-profile-'));
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

  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.httpServer.address().port + '/tests/tenant-account-profile/index.html' });
  await waitFor("document.querySelector('tbody')?.textContent.includes('Sample tenant')");
  await click('tbody .select-column');
  assert.equal(await evaluate('location.hash'), '#/tenant-accounts', 'Selection cell does not open the profile');
  await click('tbody tr td:nth-child(3)');
  await waitFor("Boolean(document.querySelector('.identity-hero'))");
  assert.equal(await evaluate('location.hash'), '#/tenant-accounts/tenant');
  assert.equal(await evaluate("document.querySelectorAll('.account-subnav-item').length"), 3);
  assert.match(await evaluate("document.querySelector('.hero-balance').textContent"), /80/);
  await click('.account-subnav-item:nth-of-type(2)');
  await waitFor("document.querySelector('tbody')?.textContent.includes('PAY-001')");
  assert.equal(await evaluate("Boolean(document.querySelector('.identity-hero'))"), false);
  await click('.account-subnav-item:nth-of-type(3)');
  await waitFor("Boolean(document.querySelector('.statement-summary'))");
  assert.match(await evaluate("document.querySelector('.statement-summary').textContent"), /Opening balance/);
  for (const lang of ['en', 'fa', 'ps']) {
    await evaluate('window.setTestLanguage(' + JSON.stringify(lang) + ')');
    await pause(100);
    assert.equal(await evaluate('document.documentElement.dir'), lang === 'en' ? 'ltr' : 'rtl');
    assert.equal(await evaluate("document.querySelectorAll('.account-subnav-item').length"), 3);
    assert.ok(!(await evaluate('document.body.innerText')).includes('undefined'));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await pause(150);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Statement fits mobile viewport');
  await evaluate("location.hash = '#/tenant-accounts/tenant'");
  await waitFor("Boolean(document.querySelector('.identity-hero'))");
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Overview fits mobile viewport');
  await click('.profile-breadcrumb button');
  await waitFor("location.hash === '#/tenant-accounts' && Boolean(document.querySelector('tbody'))");
  console.log('Passed: list-to-profile navigation, three tabs, statement balances, all languages, mobile layout, and back navigation.');
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
