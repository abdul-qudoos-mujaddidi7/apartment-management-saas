import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/tests/workflow/index.html`], { windowsHide: true, stdio: 'ignore' });
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
  for (let i = 0; i < 100 && !await evaluate("Boolean(document.querySelector('#open'))"); i++) await pause(100);
  assert.equal(await evaluate("Boolean(document.querySelector('#open'))"), true, 'Harness rendered');
  console.log('Harness rendered');
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(30); };
  const pointerClick = async selector => {
    const point = await evaluate(`(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(30);
  };
  const key = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(30); };
  const open = () => click('#open');
  const isOpen = () => evaluate("Boolean(document.querySelector('[role=dialog]'))");
  await open();
  console.log('Modal opened');
  await click('.modal-content'); assert.equal(await isOpen(), true, 'Inside click stays open');
  const hash = await evaluate('location.hash');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
  await pause(30); assert.equal(await isOpen(), false, 'Real outside click closes modal');
  assert.equal(await evaluate('location.hash'), hash, 'Outside click does not navigate');
  await open(); await key(); assert.equal(await isOpen(), false, 'Escape closes');
  await open(); await click('.btn-close'); assert.equal(await isOpen(), false, 'Close button closes');
  console.log('Modal dismissal checks passed');
  await open();
  await evaluate("document.querySelector('#number').value = '005'; document.querySelector('#number').dispatchEvent(new Event('input', {bubbles:true}));");
  assert.equal(await evaluate("document.querySelector('#number').value"), '5');
  assert.equal(await evaluate("document.querySelector('#identifier').value"), '005');
  await click('#cancel'); assert.equal(await isOpen(), true, 'Reject discard preserves form');
  assert.equal(await evaluate('window.confirmCalls'), 1, 'Cancel prompts once');
  await evaluate('window.allowDiscard = true'); await click('#cancel'); assert.equal(await isOpen(), false, 'Confirmed discard closes');
  console.log('Dirty form checks passed');
  await open();
  await click('#date'); await key(); assert.equal(await isOpen(), true, 'Picker owns first Escape');
  await key(); assert.equal(await isOpen(), false, 'Next Escape closes modal');
  await click('.row-actions-trigger'); await click('.row-actions-menu');
  assert.equal(await evaluate("Boolean(document.querySelector('.row-actions-menu'))"), true, 'Inside dropdown click stays open');
  await key(); assert.equal(await evaluate("Boolean(document.querySelector('.row-actions-menu'))"), false, 'Dropdown Escape');
  await click('.row-actions-trigger'); await pointerClick('#open');
  assert.equal(await evaluate("Boolean(document.querySelector('.row-actions-menu'))"), false, 'Dropdown outside click');
  await evaluate("window.setTestLanguage('fa')"); assert.equal(await evaluate('document.documentElement.dir'), 'rtl');
  await evaluate("window.setTestLanguage('ps')"); assert.equal(await evaluate('document.documentElement.dir'), 'rtl');
  await evaluate("window.setTestLanguage('en')"); assert.equal(await evaluate('document.documentElement.dir'), 'ltr');
  await key();
  await click('#utility-open');
  assert.match(await evaluate("document.querySelector('.alert-info').textContent"), /112.50 AFN/);
  await evaluate("document.querySelector('#reading-kind').value = 'RESET'; document.querySelector('#reading-kind').dispatchEvent(new Event('change', {bubbles:true}));");
  await pause(30); assert.equal(await evaluate("Boolean(document.querySelector('#reading-reset'))"), true, 'Reset baseline input');
  await evaluate("document.querySelector('#reading-kind').value = 'MOVE_IN'; document.querySelector('#reading-kind').dispatchEvent(new Event('change', {bubbles:true}));");
  await pause(30); assert.match(await evaluate("document.querySelector('.alert-info').textContent"), /0.00 AFN/);
  await evaluate("document.querySelector('#reading-kind').value = 'HANDOVER'; document.querySelector('#reading-kind').dispatchEvent(new Event('change', {bubbles:true}));");
  await pause(30); assert.match(await evaluate("document.querySelector('.alert-info').textContent"), /112.50 AFN/);
  console.log('Passed: electricity charge preview, reset baseline entry, move-in no-charge preview and handover preview.');
  await key();
  await click('#invoice-print');
  let printed = await evaluate('window.prepareTestPrint()');
  assert.match(printed.text, /INV-005/); assert.match(printed.text, /0009/);
  assert.match(printed.text, /100.00 USD/); assert.match(printed.text, /7,000.00 AFN/);
  assert.match(printed.text, /2.2515 AFN/); assert.equal(printed.chrome,false);
  assert.equal(printed.fonts,true); assert.match(printed.styles, /@page/);
  for (const language of ['fa','ps']) {
    await evaluate(`window.setTestLanguage('${language}')`); await pause(30);
    printed = await evaluate('window.prepareTestPrint()');
    assert.equal(printed.dir,'rtl'); assert.match(printed.text,/7,000.00 AFN/);
    assert.doesNotMatch(printed.text, /[۰-۹٠-٩]/, 'RTL invoices use English digits');
  }
  await evaluate("window.setTestLanguage('en')");
  await pause(30);
  await click('.document-item-print');
  printed = await evaluate('window.prepareTestPrint()');
  assert.match(printed.text, /Bill - Monthly rent/);
  assert.match(printed.text, /Monthly rent/);
  assert.match(printed.text, /100.00 USD/);
  assert.match(printed.text, /10.00 USD/);
  assert.match(printed.text, /90.00 USD/);
  assert.doesNotMatch(printed.text, /Electricity|8,000.00|AFN/);
  assert.equal(printed.chrome, false, 'Item print excludes buttons');
  await click('.modal-footer .btn-outline-secondary');
  assert.equal(await evaluate("document.querySelectorAll('.document-item-print').length"), 2, 'Full invoice can be restored');
  await evaluate("document.querySelectorAll('.document-item-print')[1].click()");
  await pause(30);
  printed = await evaluate('window.prepareTestPrint()');
  assert.match(printed.text, /2.2515 AFN/);
  assert.match(printed.text, /112.58 AFN/);
  assert.match(printed.text, /Electricity bill/);
  assert.doesNotMatch(printed.text, /Monthly rent|USD/);
  console.log('Passed: individual invoice items, item currency, paid/balance totals, meter rate precision and print controls excluded.');
  await key(); await evaluate("window.setTestLanguage('en')");
  await click('#payment-print');
  printed = await evaluate('window.prepareTestPrint()');
  assert.match(printed.text, /Payment receipt/);
  assert.match(printed.text, /PAY-005/);
  assert.match(printed.text, /Test Tenant/);
  assert.match(printed.text, /Cash account/);
  assert.match(printed.text, /REF-005/);
  assert.match(printed.text, /1,200.00 AFN/);
  assert.match(printed.text, /300.00 AFN/);
  assert.doesNotMatch(printed.text, /1,200.00 USD/);
  for (const language of ['fa', 'ps']) {
    await evaluate(`window.setTestLanguage('${language}')`);
    await pause(30);
    printed = await evaluate('window.prepareTestPrint()');
    assert.equal(printed.dir, 'rtl');
    assert.match(printed.text, /1,200.00 AFN/);
    assert.doesNotMatch(printed.text, /[۰-۹٠-٩]/, 'RTL payment receipts use English digits');
  }
  await evaluate("window.setTestLanguage('en'); window.setPaymentVoid()");
  await pause(30);
  printed = await evaluate('window.prepareTestPrint()');
  assert.match(printed.text, /Voided/);
  assert.match(printed.text, /Duplicate payment/);
  await evaluate('window.setPaymentWithoutLease()');
  await pause(30);
  printed = await evaluate('window.prepareTestPrint()');
  assert.match(printed.text, /Test Tenant/);
  assert.match(printed.text, /1,500.00 AFN/);
  console.log('Passed: payment receipts, allocation currency, unallocated amounts, voided payments, optional leases and RTL printing.');
  await key();
  await click('#reading-print');
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    const palette = await evaluate(`(() => {
      const sheet = document.querySelector('.document-sheet');
      const actual = getComputedStyle(sheet);
      const system = getComputedStyle(document.documentElement);
      const consumption = getComputedStyle(sheet.querySelector('.document-consumption'));
      return { background: actual.backgroundColor, text: actual.color, surface: system.getPropertyValue('--surface').trim(), ink: system.getPropertyValue('--text-strong').trim(), consumption: consumption.backgroundColor };
    })()`);
    const rgb = hex => 'rgb(' + hex.slice(1).match(/../g).map(value => parseInt(value, 16)).join(', ') + ')';
    assert.equal(palette.background, rgb(palette.surface), `${theme} preview uses system surface`);
    assert.equal(palette.text, rgb(palette.ink), `${theme} preview uses system text`);
    printed = await evaluate('window.prepareTestPrint()');
    assert.equal(await evaluate("getComputedStyle(window.testPrintFrame.contentDocument.querySelector('.document-sheet')).backgroundColor"), 'rgb(255, 255, 255)', `${theme} preview prints on white paper`);
  }
  await evaluate("document.documentElement.dataset.theme = 'light'");
  assert.match(printed.text,/handover/i); assert.match(printed.text,/150 − 100 = 50 kWh/);
  assert.match(printed.text,/112.58 AFN/); assert.match(printed.text,/<script>must stay text<\/script>/);
  assert.equal(await evaluate("Boolean(window.testPrintFrame.contentDocument.querySelector('script'))"),false);
  const printHtml = await evaluate('window.testPrintFrame.contentDocument.documentElement.outerHTML');
  await key(); assert.equal(await isOpen(),false,'Print preview Escape closes');
  await evaluate('window.testPrintFrame.remove()');
  await evaluate(`document.open(); document.write(${JSON.stringify(printHtml)}); document.close();`);
  await evaluate('document.fonts.ready.then(() => true)');
  const pdf = await send('Page.printToPDF', { printBackground:true, preferCSSPageSize:true });
  const pdfBytes = Buffer.from(pdf.data,'base64');
  assert.equal(pdfBytes.subarray(0,4).toString(),'%PDF');
  assert.equal((pdfBytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length,1,'Reading fits on one A3 page');
  const mediaBox = pdfBytes.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  assert.ok(mediaBox, 'PDF declares its paper size');
  assert.ok(Math.abs(Number(mediaBox[1]) - 841.89) < 2 && Math.abs(Number(mediaBox[2]) - 1190.55) < 2, 'PDF uses A3 portrait dimensions');
  console.log('Passed: reusable print previews, isolated A3 styles, fonts, currencies, rate precision, reading calculations, safe notes and English digits in Dari/Pashto documents.');
  console.log('Passed: modal outside/inside click, Escape, close, dirty cancel, numeric padding, text identifiers, picker Escape, dropdown outside/inside/Escape, English/Dari/Pashto direction.');
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
