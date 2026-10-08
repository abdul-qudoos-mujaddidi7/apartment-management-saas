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
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/tests/meter-report/index.html`], { windowsHide: true, stdio: 'ignore' });
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
  for (let i = 0; i < 100 && !await evaluate("Boolean(document.querySelector('.meter-number a'))"); i++) await pause(100);
  assert.equal(await evaluate("Boolean(document.querySelector('.meter-number a'))"), true, 'Harness rendered');
  console.log('Harness rendered');
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(30); };
  const pointerClick = async selector => {
    const point = await evaluate(`(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(30);
  };
  const key = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(30); };
  const open = () => click('.meter-number a');
  const isOpen = () => evaluate("Boolean(document.querySelector('[role=dialog]'))");

  const waitFor = async expression => { for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(50);}throw Error('Wait failed: '+expression); };
  await pointerClick('.select-column input');
  assert.equal(await evaluate('location.hash'),'#/meters','Checkbox does not navigate');
  await pointerClick('.meter-report-row td:nth-child(5)');
  await waitFor("location.hash === '#/meters/m1/report' && Boolean(document.querySelector('.meter-details')) && Boolean(document.querySelector('.currency-totals'))");
  assert.ok(await evaluate("document.querySelector('.report-heading').textContent.includes('005')"));
  assert.ok(await evaluate("document.querySelector('tbody').textContent.includes('Test Tenant')"));
  await click('.details-toggle');
  assert.ok(await evaluate("document.querySelector('tbody').textContent.includes('Reading notes')"));
  assert.ok(await evaluate("document.querySelector('.currency-totals').textContent.includes('100.00')"));
  assert.ok(await evaluate("window.reportRequests.some(url=>url.includes('meterId=m1'))"));
  await click('.print-reading');await waitFor("Boolean(document.querySelector('.document-sheet'))");
  assert.ok(await evaluate("document.querySelector('.document-sheet').textContent.includes('005')"));
  await key();
  await evaluate("window.setTestLanguage('fa');document.documentElement.setAttribute('data-theme','dark')");
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await pause(250);
  await evaluate('window.scrollTo(0,0)');
  const detailScreenshot=await send('Page.captureScreenshot',{captureBeyondViewport:true,clip:{x:0,y:0,width:1440,height:1000,scale:1}});
  writeFileSync(resolve(tmpdir(),'meter-report-detail.png'),Buffer.from(detailScreenshot.data,'base64'));
  console.log('Detail screenshot:',resolve(tmpdir(),'meter-report-detail.png'));
  await evaluate("window.setTestLanguage('en')");
  assert.equal(await evaluate("Boolean(document.querySelector('.utility-tabs'))"),false,'Profile has no overview tabs');
  await click('.filters-button');assert.ok(await evaluate("Boolean(document.querySelector('#report-from')) && Boolean(document.querySelector('#report-to'))"));await key();
  await evaluate("(()=>{const input=document.querySelector('.search-input');input.value='missing';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await waitFor("window.reportRequests.at(-1).includes('search=missing') && Boolean(document.querySelector('.empty-state'))").catch(async()=>{ await pause(500);assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),0); });
  await evaluate("(()=>{const input=document.querySelector('.search-input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));})()");await pause(400);
  await click('.export-button');await waitFor("window.reportRequests.at(-1).includes('export=true')");
  for(const lang of ['fa','ps']){await evaluate("window.setTestLanguage("+JSON.stringify(lang)+")");await pause(30);assert.equal(await evaluate('document.documentElement.dir'),'rtl');assert.ok(await evaluate("document.querySelector('.report-heading h2').textContent.length>0"));}
  await evaluate("document.documentElement.setAttribute('data-theme','dark')");
  const desktop = await send('Page.captureScreenshot', {captureBeyondViewport:true});
  writeFileSync(resolve(tmpdir(),'meter-report-desktop.png'), Buffer.from(desktop.data,'base64'));
  console.log('Desktop screenshot:',resolve(tmpdir(),'meter-report-desktop.png'));
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await pause(30);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= 375'),'Page fits mobile viewport');
  const mobile = await send('Page.captureScreenshot',{captureBeyondViewport:true});
  writeFileSync(resolve(tmpdir(),'meter-report-mobile.png'),Buffer.from(mobile.data,'base64'));
  console.log('Mobile screenshot:',resolve(tmpdir(),'meter-report-mobile.png'));
  console.log('Passed: meter row opens report, checkbox remains usable, history/payment details, print preview, profile filters, search, export, RTL and mobile layout.');

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
