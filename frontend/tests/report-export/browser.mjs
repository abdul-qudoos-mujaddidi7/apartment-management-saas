/**
 * The export path, end to end, in a real browser.
 *
 * A unit test can prove the workbook's XML is right; only a browser can prove
 * that pressing the button in the page produces a file on disk. So this test
 * turns downloads on, drives the actual `ExportMenu`, and reads back what the
 * browser saved — then parses the PDF's own drawing commands to check that the
 * Dari report really is mirrored rather than merely different.
 */
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync, inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const executable = process.env.TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable) throw new Error('Set TEST_BROWSER to a Chromium executable.');
const profile = mkdtempSync(resolve(tmpdir(), 'report-export-'));
const downloads = mkdtempSync(resolve(tmpdir(), 'report-export-files-'));
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser timeout: ' + method)); }, 20000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression, label = expression) {
    for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(100); }
    assert.fail('Timed out: ' + label);
  }
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(50); };
  const savedFile = async extension => {
    for (let i = 0; i < 150; i++) {
      const match = readdirSync(downloads).find(name => name.endsWith(extension));
      if (match && !match.endsWith('.crdownload')) {
        const path = resolve(downloads, match);
        // A partial file is still being written; wait until it stops growing.
        const first = statSync(path).size;
        await pause(150);
        if (statSync(path).size === first && first > 0) return { name: match, bytes: readFileSync(path) };
      }
      await pause(100);
    }
    assert.fail(`No ${extension} file was downloaded`);
  };

  await send('Runtime.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/report-export/index.html` });
  await waitFor("document.querySelectorAll('tbody tr').length === 10", 'the statement renders');

  // --- The control ---------------------------------------------------------
  assert.equal(await evaluate("document.querySelector('.export-trigger').textContent.trim()"), 'Export', 'the button is captioned');
  assert.equal(await evaluate("document.querySelector('.export-trigger').hasAttribute('data-print-exclude')"), true, 'the control never prints');
  await click('.export-trigger');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.export-option')].map(option => option.textContent.trim())"), ['Excel (.xlsx)', 'PDF (.pdf)']);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await pause(80);
  assert.equal(await evaluate("Boolean(document.querySelector('.export-menu'))"), false, 'Escape closes the menu');

  // --- Excel, as a real download -------------------------------------------
  await click('.export-trigger');
  await click('.export-option');
  const workbook = await savedFile('.xlsx');
  assert.match(workbook.name, /^tenant-statement-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/, 'the file is stamped');
  assert.equal(workbook.bytes.subarray(0, 2).toString(), 'PK', 'the saved file is a zip');
  const parts = unzip(workbook.bytes);
  for (const name of ['xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml']) {
    assert.ok(parts.has(name), `${name} was written`);
  }
  const sheet = parts.get('xl/worksheets/sheet1.xml');
  const strings = [...parts.get('xl/sharedStrings.xml').matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g)].map(match => match[1]);
  // Title, the identity and period bands, two strips of metric chips, a
  // spacer, the header, ten entries and the closing total.
  assert.equal([...sheet.matchAll(/<row /g)].length, 18, 'every band the report declares reached the sheet');
  assert.ok(strings.some(value => value.startsWith('Tenant Statement')), 'the report is titled');
  // The organisation and the account share the band under the title.
  assert.ok(strings.some(value => value.includes('Parkview Estates') && value.includes('4B')), 'the identity band names the workspace and the account');
  assert.ok(strings.includes('RCPT-0112 · Payment'), 'a data cell survives the trip');
  assert.ok(strings.includes('Total'), 'the closing band is labelled');
  assert.match(sheet, /<v>12000<\/v>/, 'money is stored as a number');
  assert.match(sheet, /<autoFilter ref="A7:F17"\/>/, 'the header filters the list');

  // --- PDF in Dari, mirrored ----------------------------------------------
  await click('.harness-actions button:nth-of-type(2)');
  await pause(200);
  await click('.export-trigger');
  await click('.export-option + .export-option');
  const pdf = await savedFile('.pdf');
  assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-', 'the saved file is a PDF');
  assert.ok(pdf.bytes.length > 20000, 'the document has substance');
  const text = pdf.bytes.toString('latin1');
  assert.ok(/\/Type\s*\/Page[^s]/.test(text), 'it holds at least one page');
  assert.match(text, /\/FontFile2/, 'the typeface travels inside the document');
  assert.match(text, /Vazirmatn/, 'the embedded face is named');

  // The page's own drawing commands: a mirrored layout starts on the right.
  const streams = pageCommands(pdf.bytes);
  const placements = positions(streams);
  assert.ok(placements.length > 20, `the table drew its cells (${placements.length} placements)`);
  assert.ok(placements[0] > 480, `the Dari title starts at the right edge (x=${placements[0]})`);
  assert.ok(/(\n| )[\d.]+ [\d.]+ [\d.]+ [\d.]+ re(\n| )/.test(streams), 'the blue bands and chips are filled shapes');

  // The same report in English is not mirrored, and differs where it should.
  const english = await evaluate("window.__reportExport.bytes('pdf')");
  const englishBytes = Buffer.from(english, 'base64');
  const englishPlacements = positions(pageCommands(englishBytes));
  assert.ok(englishPlacements.length > 20, 'the English table drew its cells');
  assert.ok(englishPlacements[0] < 100, `the English title starts at the left edge (x=${englishPlacements[0]})`);
  assert.notEqual(englishBytes.length, pdf.bytes.length, 'the two directions are not the same document');

  // --- The preview the harness shows --------------------------------------
  await click('.harness-actions-foot button');
  await waitFor("document.querySelector('[data-preview-state]').textContent === 'ready'", 'the preview renders');
  assert.ok(await evaluate("document.querySelector('.harness-frame').src.startsWith('blob:')"), 'the PDF preview is served from the page');

  console.log('Passed: the export menu, a real .xlsx download, a real mirrored Dari .pdf, and the in-page preview.');
} finally {
  if (socket?.readyState === WebSocket.OPEN && send) { await send('Browser.close').catch(() => {}); socket.close(); }
  browser?.kill();
  await server.close();
  for (const directory of [profile, downloads]) {
    const withinTemp = relative(resolve(tmpdir()), resolve(directory));
    if (withinTemp && !withinTemp.startsWith('..') && !withinTemp.includes(':')) {
      await pause(300);
      try { rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { /* Chrome may still hold its profile. */ }
    }
  }
}

/**
 * The drawing commands of every page, decompressed.
 *
 * jsPDF may write the streams wrapped (zlib) or raw, so both are tried; a
 * stream that will not inflate is skipped rather than failing the whole test.
 */
function pageCommands(bytes) {
  const text = bytes.toString('latin1');
  return [...text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    const raw = Buffer.from(match[1], 'latin1');
    try { return inflateSync(raw).toString('latin1'); } catch { /* raw deflate below */ }
    try { return inflateRawSync(raw).toString('latin1'); } catch { return ''; }
  }).join('\n');
}

/** The x of every text placement, in the order the document draws them. */
function positions(commands) {
  return [...commands.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) Tm/g)].map((match) => Number(match[5]));
}

/** A reader for the stored-entry zips this writer makes. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50, 'the file ends with an end-of-central-directory record');
  let offset = view.getUint32(end + 16, true);

  for (let index = 0; index < view.getUint16(end + 10, true); index++) {
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + size)));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
