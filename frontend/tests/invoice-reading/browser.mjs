import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const executable = process.env.TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable) throw new Error('Set TEST_BROWSER to a Chromium executable.');
const profile = mkdtempSync(resolve(tmpdir(), 'apartment-workflow-'));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
let socket;
let send;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/tests/invoice-reading/index.html`], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', error => console.error(error.message));
  const portFile = resolve(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !existsSync(portFile); i++) await pause(100);
  if (!existsSync(portFile)) throw new Error('Browser did not start its debugging endpoint.');
  const debugPort = readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  const target = targets.find(t => t.type === 'page');
  console.log('Browser connected:', target.url);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
    return result.result.value;
  }

  const waitFor = async expression => { for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(50);}throw Error('Wait failed: '+expression); };
  const click = async selector => {
    const point = await evaluate('(()=>{const node=document.querySelector('+JSON.stringify(selector)+');let rect=node.getBoundingClientRect();if(rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth){node.scrollIntoView({block:"center",inline:"center"});rect=node.getBoundingClientRect();}return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()');
    await send('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',clickCount:1});
    await pause(50);
  };
  const change = async (selector, value) => { await evaluate('(()=>{const node=document.querySelector('+JSON.stringify(selector)+');node.value='+JSON.stringify(value)+';node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input",{bubbles:true}));})()'); await pause(60); };
  await waitFor("Boolean(document.querySelector('.add-button'))");
  await click('.add-button');
  await waitFor("document.querySelector('#invoice-apartment option[value=l1]') !== null");
  await change('.items-table select', 'ELECTRICITY');
  await click('.quick-reading-button');
  assert.ok(await evaluate("document.querySelector('#invoice-apartment').classList.contains('is-invalid')"), 'Missing apartment gets useful validation');
  await change('#invoice-apartment', 'l1');
  await click('.quick-reading-button');
  await waitFor("document.querySelector('#quick-reading-current') !== null");
  await waitFor("document.querySelector('#quick-reading-meter').value === 'm1'");
  await change('#quick-reading-current', '150');
  await waitFor("!document.querySelector('button[form=invoice-quick-reading]').disabled");
  await click('button[form=invoice-quick-reading]');
  await waitFor("document.querySelector('#quick-reading-current') === null");
  assert.equal(await evaluate("document.querySelector('.reading-picker select').value"), 'new');
  assert.ok(await evaluate("window.quickRequests.some(r=>r.method==='POST' && r.path==='/api/meter-readings' && r.body.leaseId==='l1' && r.body.currentReading===150)"));
  await evaluate("document.querySelectorAll('#invoice-form')[0].closest('.modal').querySelector('.btn-close').click()");
  await evaluate("document.querySelector('.actions-cell button').click()");
  await pause(80);
  await evaluate("document.querySelector('.row-menu-item:has(.bi-pencil)').click()");
  await waitFor("document.querySelector('.quick-reading-button') !== null");
  assert.equal(await evaluate("document.querySelector('.reading-picker select').value"), 'old', 'Existing reading preserved while editing');
  await click('.quick-reading-button');
  await waitFor("document.querySelector('#quick-reading-current') !== null");
  await waitFor("!document.querySelector('button[form=invoice-quick-reading]').disabled");
  await change('#quick-reading-current', '155');
  await click('button[form=invoice-quick-reading]');
  await waitFor("document.querySelector('#quick-reading-current') === null");
  assert.equal(await evaluate("document.querySelector('.reading-picker select').value"), 'new');
  await click('button[form=invoice-form]');
  await waitFor("document.querySelector('#invoice-form') === null");
  assert.ok(await evaluate("window.quickRequests.some(r=>r.method==='PATCH' && r.path==='/api/invoices/i1' && r.body.items[0].meterReadingId==='new')"), 'Updated invoice submits saved reading');
  await evaluate('window.sameDateReadings = true');
  await click('.add-button');
  await waitFor("document.querySelector('#invoice-apartment option[value=l1]') !== null");
  await change('#invoice-apartment', 'l1');
  await waitFor("document.querySelectorAll('.items-table tbody tr').length === 3");
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.reading-picker select')).map(node=>node.value).sort()"), ['gasToday','waterToday']);
  await change('#invoice-apartment', 'l1');
  assert.equal(await evaluate("document.querySelectorAll('.items-table tbody tr').length"), 3, 'Matching readings are not duplicated');
  console.log('Passed: create/edit quick action opens and saves with mouse clicks; invoice submits reading; same-date rent readings auto-fill without baselines, other leases, earlier dates or duplicates.');
} finally {
  if (socket?.readyState === WebSocket.OPEN && send) { await send('Browser.close').catch(() => {}); socket.close(); }
  browser?.kill();
  await server.close();
  // Verify the exact temporary directory before recursive cleanup on Windows.
  const withinTemp = relative(resolve(tmpdir()), resolve(profile));
  if (withinTemp && !withinTemp.startsWith('..') && !withinTemp.includes(':')) {
    await pause(300);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { /* Browser may still be releasing its profile. */ }
  }
}
