/*
 * The currency list the "Add currency" form offers.
 *
 * The names come from a live currency API (see CURRENCY_CATALOGUE_URL) so the
 * list stays current without a release, and the result is cached in memory for a
 * day. Symbols are not part of that payload, so they come from the table below,
 * which also doubles as the fallback: a laptop with no network still gets a
 * usable list, and a currency missing from the table simply has no symbol until
 * someone types one.
 *
 * Nothing here validates what an organization may store — a currency is a
 * three-letter code, and the form can still add one this list has never heard of.
 */

const DEFAULT_CATALOGUE_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json';

/* `undefined` means "use the default"; an empty string switches the network off. */
const catalogueUrl = process.env.CURRENCY_CATALOGUE_URL === undefined
  ? DEFAULT_CATALOGUE_URL
  : process.env.CURRENCY_CATALOGUE_URL;

const REQUEST_TIMEOUT_MS = Number(process.env.CURRENCY_CATALOGUE_TIMEOUT_MS || 2500);
const CACHE_TTL_MS = Number(process.env.CURRENCY_CATALOGUE_CACHE_MS || 24 * 60 * 60 * 1000);
const MAX_SEARCH_LENGTH = 100;

const CURRENCY_CODE = /^[A-Z]{3}$/;

/*
 * Crypto tickers and precious metals are three letters too, so they pass the
 * shape test above and arrive in the API payload. None of them can be billed as
 * rent, so the picker leaves them out; the form can still add one by hand.
 */
const NON_FIAT = new Set([
  'ADA', 'AKT', 'ALGO', 'AMP', 'APE', 'APT', 'ARB', 'ATOM', 'AVAX', 'AXS',
  'BAT', 'BCH', 'BNB', 'BSV', 'BSW', 'BTC', 'BTG', 'BTT', 'CFX', 'CHZ',
  'CRO', 'CRV', 'CVX', 'DAI', 'DCR', 'DFI', 'DOGE', 'DOT', 'ENJ', 'EOS',
  'ETC', 'ETH', 'FEI', 'FIL', 'FLR', 'FTT', 'GALA', 'GMX', 'GNO', 'GRT',
  'HBAR', 'HNT', 'HOT', 'ICP', 'IMX', 'INJ', 'KCS', 'KDA', 'KNC', 'KSM',
  'LDO', 'LEO', 'LINK', 'LRC', 'LTC', 'MANA', 'MBX', 'MKR', 'NEO', 'NFT',
  'OKB', 'ONE', 'POL', 'QNT', 'RPL', 'RVN', 'SAND', 'SHIB', 'SNX', 'SOL',
  'SPL', 'STX', 'SUI', 'TRX', 'UNI', 'VET', 'WOO', 'XAG', 'XAU', 'XCH',
  'XDC', 'XDR', 'XEC', 'XEM', 'XLM', 'XMR', 'XPD', 'XPT', 'XRP', 'XTZ',
  'ZEC', 'ZIL',
]);

/* Bundled names and symbols, used when the API is unreachable or silent. */
const BUNDLED = {
  AED: { name: 'UAE Dirham', symbol: 'د.إ' },
  AFN: { name: 'Afghan Afghani', symbol: '؋' },
  ALL: { name: 'Albanian Lek', symbol: 'L' },
  AMD: { name: 'Armenian Dram', symbol: '֏' },
  ARS: { name: 'Argentine Peso', symbol: '$' },
  AUD: { name: 'Australian Dollar', symbol: 'A$' },
  AZN: { name: 'Azerbaijani Manat', symbol: '₼' },
  BAM: { name: 'Bosnia-Herzegovina Convertible Mark', symbol: 'KM' },
  BDT: { name: 'Bangladeshi Taka', symbol: '৳' },
  BGN: { name: 'Bulgarian Lev', symbol: 'лв' },
  BHD: { name: 'Bahraini Dinar', symbol: 'د.ب' },
  BRL: { name: 'Brazilian Real', symbol: 'R$' },
  BWP: { name: 'Botswana Pula', symbol: 'P' },
  BYN: { name: 'Belarusian Ruble', symbol: 'Br' },
  CAD: { name: 'Canadian Dollar', symbol: 'C$' },
  CHF: { name: 'Swiss Franc', symbol: 'CHF' },
  CLP: { name: 'Chilean Peso', symbol: '$' },
  CNY: { name: 'Chinese Yuan', symbol: '¥' },
  COP: { name: 'Colombian Peso', symbol: '$' },
  CZK: { name: 'Czech Koruna', symbol: 'Kč' },
  DKK: { name: 'Danish Krone', symbol: 'kr' },
  DZD: { name: 'Algerian Dinar', symbol: 'د.ج' },
  EGP: { name: 'Egyptian Pound', symbol: 'E£' },
  ETB: { name: 'Ethiopian Birr', symbol: 'Br' },
  EUR: { name: 'Euro', symbol: '€' },
  GBP: { name: 'Pound Sterling', symbol: '£' },
  GEL: { name: 'Georgian Lari', symbol: '₾' },
  GHS: { name: 'Ghanaian Cedi', symbol: '₵' },
  HKD: { name: 'Hong Kong Dollar', symbol: 'HK$' },
  HUF: { name: 'Hungarian Forint', symbol: 'Ft' },
  IDR: { name: 'Indonesian Rupiah', symbol: 'Rp' },
  INR: { name: 'Indian Rupee', symbol: '₹' },
  IQD: { name: 'Iraqi Dinar', symbol: 'ع.د' },
  IRR: { name: 'Iranian Rial', symbol: '﷼' },
  JOD: { name: 'Jordanian Dinar', symbol: 'د.ا' },
  JPY: { name: 'Japanese Yen', symbol: '¥' },
  KES: { name: 'Kenyan Shilling', symbol: 'KSh' },
  KGS: { name: 'Kyrgyzstani Som', symbol: 'сом' },
  KRW: { name: 'South Korean Won', symbol: '₩' },
  KWD: { name: 'Kuwaiti Dinar', symbol: 'د.ك' },
  KZT: { name: 'Kazakhstani Tenge', symbol: '₸' },
  LBP: { name: 'Lebanese Pound', symbol: 'ل.ل' },
  LKR: { name: 'Sri Lankan Rupee', symbol: '₨' },
  LYD: { name: 'Libyan Dinar', symbol: 'ل.د' },
  MAD: { name: 'Moroccan Dirham', symbol: 'د.م.' },
  MDL: { name: 'Moldovan Leu', symbol: 'L' },
  MKD: { name: 'Macedonian Denar', symbol: 'ден' },
  MUR: { name: 'Mauritian Rupee', symbol: '₨' },
  MWK: { name: 'Malawian Kwacha', symbol: 'MK' },
  MXN: { name: 'Mexican Peso', symbol: '$' },
  MYR: { name: 'Malaysian Ringgit', symbol: 'RM' },
  MZN: { name: 'Mozambican Metical', symbol: 'MT' },
  NGN: { name: 'Nigerian Naira', symbol: '₦' },
  NOK: { name: 'Norwegian Krone', symbol: 'kr' },
  NPR: { name: 'Nepalese Rupee', symbol: '₨' },
  NZD: { name: 'New Zealand Dollar', symbol: 'NZ$' },
  OMR: { name: 'Omani Rial', symbol: 'ر.ع.' },
  PEN: { name: 'Peruvian Sol', symbol: 'S/' },
  PHP: { name: 'Philippine Peso', symbol: '₱' },
  PKR: { name: 'Pakistani Rupee', symbol: '₨' },
  PLN: { name: 'Polish Złoty', symbol: 'zł' },
  QAR: { name: 'Qatari Riyal', symbol: 'ر.ق' },
  RON: { name: 'Romanian Leu', symbol: 'lei' },
  RSD: { name: 'Serbian Dinar', symbol: 'дин' },
  RUB: { name: 'Russian Ruble', symbol: '₽' },
  SAR: { name: 'Saudi Riyal', symbol: 'ر.س' },
  SDG: { name: 'Sudanese Pound', symbol: 'ج.س' },
  SEK: { name: 'Swedish Krona', symbol: 'kr' },
  SGD: { name: 'Singapore Dollar', symbol: 'S$' },
  SYP: { name: 'Syrian Pound', symbol: 'ل.س' },
  THB: { name: 'Thai Baht', symbol: '฿' },
  TJS: { name: 'Tajikistani Somoni', symbol: 'ЅМ' },
  TMT: { name: 'Turkmenistani Manat', symbol: 'm' },
  TND: { name: 'Tunisian Dinar', symbol: 'د.ت' },
  TRY: { name: 'Turkish Lira', symbol: '₺' },
  TWD: { name: 'New Taiwan Dollar', symbol: 'NT$' },
  TZS: { name: 'Tanzanian Shilling', symbol: 'TSh' },
  UAH: { name: 'Ukrainian Hryvnia', symbol: '₴' },
  UGX: { name: 'Ugandan Shilling', symbol: 'USh' },
  USD: { name: 'US Dollar', symbol: '$' },
  UYU: { name: 'Uruguayan Peso', symbol: '$U' },
  UZS: { name: "Uzbekistani Som", symbol: 'soʻm' },
  VES: { name: 'Venezuelan Bolívar', symbol: 'Bs' },
  VND: { name: 'Vietnamese Dong', symbol: '₫' },
  XAF: { name: 'Central African CFA Franc', symbol: 'FCFA' },
  XOF: { name: 'West African CFA Franc', symbol: 'CFA' },
  YER: { name: 'Yemeni Rial', symbol: '﷼' },
  ZAR: { name: 'South African Rand', symbol: 'R' },
  ZMW: { name: 'Zambian Kwacha', symbol: 'ZK' },
};

/*
 * Currencies that have been withdrawn and replaced, usually by the euro. The
 * API still lists them, and "German Deutsche Mark" has no place in a rent
 * picker. A document can still be issued in one — the form accepts any
 * three-letter code — it just is not offered as a suggestion.
 */
const RETIRED = new Set([
  'ANG', 'ATS', 'AZM', 'BEF', 'BYR', 'CNH', 'CUC', 'CYP', 'DEM', 'EEK',
  'ESP', 'FIM', 'FRF', 'GHC', 'GRD', 'HRK', 'IEP', 'ITL', 'LTL', 'LUF',
  'LVL', 'MGF', 'MRO', 'MTL', 'MZM', 'NLG', 'PTE', 'ROL', 'SDD', 'SIT',
  'SKK', 'SLL', 'SRG', 'STD', 'TMM', 'TPE', 'TRL', 'VEB', 'VEF', 'XEU',
  'YDD', 'YUM', 'ZMK', 'ZWD', 'ZWN', 'ZWR', 'ZWL',
]);

/* { items, source, fetchedAt } — one entry per process, refreshed after a day. */
let cache = null;
let inFlight = null;

/**
 * Fetch the upstream code → name map.
 * Any failure (offline, DNS, timeout, a changed payload) resolves to null: the
 * form must keep working on a machine with no network, so this never throws.
 */
async function fetchUpstream() {
  if (!catalogueUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(catalogueUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    if (!payload || typeof payload !== 'object') return null;

    return payload;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* The API returns lowercase keys; three letters and not crypto means fiat. */
function normaliseUpstream(payload) {
  const names = {};
  for (const [key, value] of Object.entries(payload || {})) {
    const code = String(key).toUpperCase();
    if (CURRENCY_CODE.test(code) && !NON_FIAT.has(code) && !RETIRED.has(code) && typeof value === 'string' && value.trim()) {
      names[code] = value.trim();
    }
  }
  return names;
}

function buildItems(upstreamNames) {
  const codes = new Set([...Object.keys(BUNDLED), ...Object.keys(upstreamNames)]);

  return [...codes]
    .map((code) => ({
      code,
      /* The API's naming wins when it answers; the bundled name fills the gaps. */
      name: upstreamNames[code] || BUNDLED[code]?.name || code,
      symbol: BUNDLED[code]?.symbol || null,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

async function buildCatalogue() {
  const upstreamNames = normaliseUpstream(await fetchUpstream());
  const live = Object.keys(upstreamNames).length > 0;

  cache = {
    items: buildItems(live ? upstreamNames : {}),
    source: live ? 'api' : 'bundled',
    fetchedAt: new Date().toISOString(),
  };

  return cache;
}

/**
 * The catalogue, from cache when fresh.
 * `force` refreshes on demand (the form's refresh button).
 */
async function getCatalogue({ force = false } = {}) {
  if (!force && cache && Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_TTL_MS) {
    return cache;
  }

  /* Concurrent misses share one request rather than one per caller. */
  if (!inFlight) {
    inFlight = buildCatalogue().finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
}

/** Filter the catalogue for the picker. An empty search returns everything. */
async function searchCatalogue(search = '', { force = false } = {}) {
  const catalogue = await getCatalogue({ force });
  const term = String(search || '').trim().toUpperCase().slice(0, MAX_SEARCH_LENGTH);

  const items = term
    ? catalogue.items.filter(
      (item) => item.code.includes(term) || item.name.toUpperCase().includes(term),
    )
    : catalogue.items;

  return {
    items,
    source: catalogue.source,
    fetchedAt: catalogue.fetchedAt,
    total: catalogue.items.length,
  };
}

module.exports = {
  BUNDLED,
  CURRENCY_CODE,
  NON_FIAT,
  RETIRED,
  getCatalogue,
  searchCatalogue,
};
