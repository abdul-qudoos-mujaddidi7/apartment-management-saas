/*
 * shamsi.js
 *
 * The Shamsi (Jalali) calendar, which is the calendar this application shows
 * every date in. The twin of this file lives in the frontend
 * (`src/utils/shamsiDate.js`) and the two are kept deliberately identical —
 * there is no shared package between the workspaces, so the algorithm is
 * duplicated rather than approximated. `meter-reading.period.test.js` checks
 * this port against the values the frontend produces.
 *
 * The conversions the server needs are here: a Gregorian instant to its Shamsi
 * year, month and day, and back again — the contract's rent schedule is ruled by
 * Shamsi months, so the month a rent is due in has to be turned into the date
 * the office writes beside it.
 */

const MONTH_NAMES = [
  'Hamal', 'Saur', 'Jawza', 'Saratan', 'Asad', 'Sunbula',
  'Mizan', 'Aqrab', 'Qaws', 'Jadi', 'Dalwa', 'Hoot',
];

/**
 * The same twelve months in the script an Afghan reader reads them in.
 *
 * The names are the *Afghan* ones (`Saratan`, not the Iranian `Tir`), matching
 * `frontend/src/utils/shamsiDate.js` — a contract printed in Dari must name
 * months the way the office that signs it does.
 */
const AFGHAN_MONTH_NAMES = [
  'حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله',
  'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت',
];

const div = (a, b) => Math.trunc(a / b);
const mod = (a, b) => a - Math.trunc(a / b) * b;

function jalCal(jy) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;
  if (jy < jp || jy >= breaks[breaks.length - 1]) throw new Error('Invalid Shamsi year');
  for (let i = 1; i < breaks.length; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** The day number of a Shamsi date, which is what the conversions count in. */
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const g = d2g(jdn);
  let jy = g.gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(g.gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

/**
 * A date's Shamsi year, month and day.
 *
 * Dates are stored as UTC midnights (`2026-09-22T00:00:00.000Z`) all over this
 * application, so the conversion reads the UTC parts: the day the user typed is
 * the day that comes back, whatever the server's own timezone is.
 */
function toShamsi(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return d2j(g2d(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
}

/**
 * The Shamsi month a date falls in, as `YYYY-MM` — `1405-06` for the sixth
 * month of 1405. This is the key a monthly rule is written against: a Shamsi
 * month starts and ends on Gregorian dates that cannot be expressed as one
 * Gregorian month, so a rule keyed on the Gregorian month would refuse a
 * reading the user is entitled to and allow one they are not.
 */
function shamsiMonthKey(value) {
  const parts = toShamsi(value);
  if (!parts) return null;
  return `${parts.jy}-${String(parts.jm).padStart(2, '0')}`;
}

/** `1405-06` → `Sunbula 1405`, for a message a person reads. */
function shamsiMonthLabel(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(key || '');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return String(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * How many days a Shamsi month has. The first six have 31, the next five 30,
 * and the last one 29 or 30 depending on whether the year is a leap year —
 * which is asked of the calendar rather than worked out, so the answer cannot
 * drift from the conversions above.
 */
function shamsiMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;

  const parts = d2j(j2d(jy, 12, 30));
  return parts.jm === 12 && parts.jd === 30 ? 30 : 29;
}

/**
 * A Shamsi date as the midnight the rest of this application stores dates at.
 *
 * Built in UTC for the same reason the conversion above reads UTC parts: the
 * day the office wrote is the day that comes back, whatever the server's own
 * timezone is.
 */
function shamsiToDate(jy, jm, jd) {
  const g = d2g(j2d(jy, jm, jd));
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
}

/**
 * A date as the application writes it: `1405/06/29`, or `29 سرطان 1405` when the
 * month's own name is wanted.
 *
 * This is a port of `formatShamsiDate` in the frontend, kept deliberately
 * identical for the same reason the calendar itself is duplicated — a contract
 * is assembled on the server, and it must read exactly like every date the
 * browser draws. An unreadable value comes back as an em dash rather than as
 * "Invalid Date".
 */
function formatShamsiDate(value, { monthName = false } = {}) {
  // `new Date(null)` is the epoch, so an absent value is caught before it can
  // become a date rather than after.
  if (!value) return '—';

  const parts = toShamsi(value);
  if (!parts) return '—';
  if (monthName) return `${parts.jd} ${AFGHAN_MONTH_NAMES[parts.jm - 1]} ${parts.jy}`;
  return `${parts.jy}/${String(parts.jm).padStart(2, '0')}/${String(parts.jd).padStart(2, '0')}`;
}

module.exports = {
  AFGHAN_MONTH_NAMES,
  MONTH_NAMES,
  formatShamsiDate,
  shamsiMonthKey,
  shamsiMonthLabel,
  shamsiMonthLength,
  shamsiToDate,
  toShamsi,
};
