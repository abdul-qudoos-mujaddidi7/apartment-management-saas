/**
 * Headless-Chrome verification harness for the dashboard.
 *
 * Usage: node .freebuff/cdp-dash.mjs [lang] [width] [height] [outfile]
 *
 * Logs in over the API, injects the session cookie into an isolated Chrome,
 * opens the dashboard, waits for the real figures, then writes a screenshot and
 * a JSON report of what the page actually rendered.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [lang = 'en', width = '1440', height = '900', out = '.freebuff/dash.png'] = process.argv.slice(2);
const PORT = 9300 + Math.floor(Math.random() * 400);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-dash-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* --- session ---------------------------------------------------------------
   The API rate-limits /auth/login to 10 attempts per 15 minutes, so reuse a
   cached token and only log in when there isn't a fresh one. */
const TOKEN_CACHE = '.freebuff/.dashboard-token';
let token = '';

if (fs.existsSync(TOKEN_CACHE) && Date.now() - fs.statSync(TOKEN_CACHE).mtimeMs < 20 * 60 * 60 * 1000) {
  token = fs.readFileSync(TOKEN_CACHE, 'utf8').trim();
}

if (!token) {
  const login = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'Admin@123456' })
  });
  const cookie = (login.headers.getSetCookie() || [])[0] || '';
  token = cookie.split(';')[0].split('=')[1] || '';
  if (!token) throw new Error('login failed: ' + (await login.clone().text()).slice(0, 200));
  fs.writeFileSync(TOKEN_CACHE, token);
}

/* --- chrome ---------------------------------------------------------------- */
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  `--window-size=${width},${height}`,
  'about:blank'
], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill(); } catch { /* already gone */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
};
process.on('exit', cleanup);

let target = null;
for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((entry) => entry.type === 'page');
  } catch { /* not up yet */ }
  if (!target) await sleep(250);
}
if (!target) {
  cleanup();
  throw new Error('Chrome never exposed a page target');
}

/* --- CDP ------------------------------------------------------------------- */
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const consoleMessages = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);

  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }

  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    consoleMessages.push(`${message.params.type}: ${message.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
  }
  if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level)) {
    consoleMessages.push(`${message.params.entry.level}: ${message.params.entry.text}`);
  }
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('apartmentpro.language', ${JSON.stringify(lang)});` });
await send('Network.setCookie', { name: 'accessToken', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' });
await send('Page.navigate', { url: 'http://localhost:5173/#/dashboard' });

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.text + ' ' + (exceptionDetails.exception?.description || ''));
  return result.value;
};

for (let attempt = 0; attempt < 80; attempt += 1) {
  const ready = await evaluate("Boolean(document.querySelector('.dash .card-chart') && !document.querySelector('.skeleton-value'))");
  if (ready) break;
  await sleep(250);
}
await sleep(1200); // let the column animation settle

const report = await evaluate(`(() => {
  const text = (node) => (node ? node.textContent.replace(/\\s+/g, ' ').trim() : null);
  const box = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), right: Math.round(rect.right) };
  };
  const col = (selector) => Array.from(document.querySelectorAll(selector));
  const style = (selector, prop) => {
    const el = document.querySelector(selector);
    return el ? getComputedStyle(el)[prop] : null;
  };
  const cards = Array.from(document.querySelectorAll('.card, .band-welcome, .band-kpi'));
  const viewport = document.documentElement.clientWidth;

  return {
    url: location.href,
    bodyStart: text(document.body).slice(0, 220),
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    viewport: { w: viewport, scroll: document.documentElement.scrollWidth },
    welcome: {
      eyebrow: text(document.querySelector('.welcome-eyebrow')),
      title: text(document.querySelector('.welcome-title')),
      copy: text(document.querySelector('.welcome-copy-text')),
      date: text(document.querySelector('.welcome-date')),
      hero: text(document.querySelector('.hero-value')),
      heroHint: text(document.querySelector('.hero-hint')),
      heroBarSegments: col('.hero-seg').map((s) => ({ cls: s.className, w: Math.round(s.getBoundingClientRect().width) }))
    },
    kpis: col('.kpi').map((k) => ({ label: text(k.querySelector('.kpi-label')), value: text(k.querySelector('.kpi-value')), hint: text(k.querySelector('.kpi-hint')) })),
    chart: {
      max: text(document.querySelector('.axis-max')),
      share: text(document.querySelector('.share-value')),
      shareLabel: text(document.querySelector('.share-label')),
      columns: col('.chart-col').map((c) => {
        const track = c.querySelector('.chart-track');
        const cap = c.querySelector('.chart-cap');
        const trackBox = box(track);
        const capBox = box(cap);
        return {
          aria: c.getAttribute('aria-label'),
          month: text(c.querySelector('.chart-month')),
          empty: track?.classList.contains('is-empty') || false,
          trackH: trackBox && trackBox.h,
          capH: capBox && capBox.h,
          capShare: trackBox && capBox ? Math.round((capBox.h / trackBox.h) * 100) : null,
          left: trackBox && trackBox.x,
          bottom: trackBox && trackBox.y + trackBox.h,
          anim: track ? getComputedStyle(track).animationName : null
        };
      }),
      legend: col('.chart-legend li').map((li) => text(li))
    },
    mix: {
      total: text(document.querySelector('.mix-total')),
      barWidth: box(document.querySelector('.mix-bar'))?.w,
      segments: col('.mix-bar .seg').map((s) => ({ cls: s.className, w: Math.round(s.getBoundingClientRect().width) })),
      rows: col('.mix-legend li').map((li) => text(li))
    },
    attention: col('.band-grid-three .card').map((card) => ({
      heading: text(card.querySelector('h3')),
      empty: text(card.querySelector('.card-empty')),
      rows: Array.from(card.querySelectorAll('.rows li')).map((li) => text(li))
    })),
    tenancies: {
      heading: text(document.querySelector('.card-table h3')),
      columns: col('.data-table thead th').map((th) => text(th)),
      rows: col('.data-table tbody tr').length
    },
    boxes: {
      chartCard: box(document.querySelector('.card-chart')),
      chartHead: box(document.querySelector('.card-chart .card-head')),
      axisMax: box(document.querySelector('.axis-max')),
      chartList: box(document.querySelector('.chart')),
      firstTrack: box(document.querySelector('.chart-track')),
      legend: box(document.querySelector('.chart-legend')),
      mixCard: box(document.querySelector('.card-mix')),
      mixLegend: box(document.querySelector('.mix-legend'))
    },
    geometry: {
      dashGaps: style('.dash', 'gap'),
      cardPadding: style('.card', 'padding'),
      welcomePadding: style('.band-welcome', 'padding'),
      kpiColumns: style('.band-kpi', 'gridTemplateColumns'),
      cardColumns: style('.band-grid', 'gridTemplateColumns')
    },
    overflow: {
      page: document.documentElement.scrollWidth > viewport,
      cards: cards.filter((c) => c.getBoundingClientRect().right > viewport + 1).map((c) => c.className)
    }
  };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ ...report, consoleMessages }, null, 1));
console.log('\nSCREENSHOT ' + path.resolve(out));

// Second capture: the active-tenancy table, scrolled into view, plus a hit test
// on every action control so a clipped button cannot pass unnoticed.
const table = await evaluate(`(() => {
  const card = document.querySelector('.card-table');
  card.scrollIntoView({ block: 'start' });
  const tds = Array.from(document.querySelectorAll('.data-table .actions-cell'));
  const hits = tds.flatMap((td) => Array.from(td.querySelectorAll('button, a')).map((el) => {
    const r = el.getBoundingClientRect();
    const found = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { label: el.textContent.replace(/\\s+/g, ' ').trim(), ok: found === el || el.contains(found), w: Math.round(r.width), right: Math.round(r.right) };
  }));
  const cell = document.querySelector('.data-table .actions-cell');
  const panel = document.querySelector('.card-table');
  return {
    hits,
    cellRight: cell && Math.round(cell.getBoundingClientRect().right),
    panelRight: panel && Math.round(panel.getBoundingClientRect().right),
    tableScroll: document.querySelector('.data-table')?.scrollWidth,
    wrapWidth: document.querySelector('.card-table')?.clientWidth
  };
})()`);
await sleep(400);
const tableShot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out.replace(/\.png$/, '-table.png'), Buffer.from(tableShot.data, 'base64'));
console.log('TABLE ' + JSON.stringify(table, null, 1));

// Optional flow: FLOW=invoice drives the quick-invoice dialog from a tenancy row
// (open → submit → the notice and a refreshed dashboard).
if (process.env.FLOW === 'invoice') {
  const opened = await evaluate(`(() => {
    const button = document.querySelector('.data-table .actions-cell .btn-primary');
    button.scrollIntoView({ block: 'center' });
    button.click();
    return button.textContent.replace(/\\s+/g, ' ').trim();
  })()`);

  let modal = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    modal = await evaluate(`(() => {
      const dialog = document.querySelector('.modal.show, [role="dialog"]');
      if (!dialog) return null;
      return { title: dialog.querySelector('.modal-title')?.textContent.trim(), items: dialog.querySelectorAll('.quick-invoice-items-table tbody tr').length };
    })()`);
    if (modal) break;
    await sleep(200);
  }
  await sleep(900);

  const submitted = await evaluate(`(() => {
    const form = document.querySelector('#quick-invoice-form');
    const submit = document.querySelector('button[type="submit"][form="quick-invoice-form"]');
    if (!form || !submit) return { ok: false, reason: 'dialog controls missing' };
    submit.click();
    return { ok: true };
  })()`);

  let outcome = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    outcome = await evaluate(`(() => ({
      notice: document.querySelector('.alert-success')?.textContent.replace(/\\s+/g, ' ').trim() || null,
      dialogOpen: Boolean(document.querySelector('.modal.show')),
      dialogError: document.querySelector('[role="dialog"] .alert-danger')?.textContent.replace(/\\s+/g, ' ').trim() || null,
      outstanding: document.querySelectorAll('.kpi')[3]?.querySelector('.kpi-value')?.textContent.trim() || null,
      overdueRows: document.querySelectorAll('.band-grid-three .card:first-child .rows li').length
    }))()`);
    if (outcome.notice || outcome.dialogError) break;
    await sleep(250);
  }

  const flowShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out.replace(/\.png$/, '-flow.png'), Buffer.from(flowShot.data, 'base64'));
  console.log('FLOW ' + JSON.stringify({ opened, modal, submitted, outcome }, null, 1));
}

socket.close();
chrome.kill();
process.exit(0);
