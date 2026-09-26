const fs = require('fs');
const path = require('path');

const { resolveUpload } = require('../../lib/uploads');
const { toDocumentDigits } = require('./lease-contract.format');

/**
 * The contract as one self-contained HTML file, ready to be printed to PDF.
 *
 * This is the second drawing of the document — the first being the preview in
 * `pages/LeaseContract.svelte` — and the two are deliberately identical: the same
 * markup shape, the same class names, and one stylesheet that both read
 * (`contract-document.css`, which sits beside this file). The only difference
 * between them is where the bytes come from.
 *
 * Self-contained is the requirement, not a nicety. The page is rendered by a
 * headless browser launched against a `file://` URL with no network and no
 * session, so everything it needs has to be inside the file:
 *
 *   * the stylesheet, inlined;
 *   * the Vazirmatn faces, inlined as data URLs, or Dari text would print as
 *     empty boxes on a machine that has no Persian font;
 *   * the office's logo, inlined the same way — a stored `/uploads/...` path
 *     means nothing to a document with no server to ask.
 *
 * The document is laid out as the printed form the office issues: a hero band
 * naming the office and the document, the two parties and the day the tenancy
 * begins, then a section for each part of the agreement — the unit, the
 * tenancy statement, the charges the unit carries, the term and the deposit,
 * the condition the unit is handed over in, the numbered conditions, the notes
 * under them, and the signatures. A month-by-month rent schedule is not part of
 * it: the contract states the term, and what falls due month by month is the
 * ledger's business.
 *
 * Every value is HTML-escaped on the way in. A section is the reason: its text
 * mixes organization-written wording with tenant data, and a value that happened
 * to contain `<` must print as a `<`, never as markup.
 */

const STYLESHEET_PATH = path.resolve(__dirname, 'contract-document.css');
const FONT_DIRECTORY = path.resolve(__dirname, '../../../../frontend/public/fonts/vazirmatn');

/** The weights the document actually sets: body, the form's quiet labels, bold. */
const FONT_WEIGHTS = [
  { weight: 400, file: 'Vazirmatn-Regular.woff2' },
  { weight: 600, file: 'Vazirmatn-SemiBold.woff2' },
  { weight: 700, file: 'Vazirmatn-Bold.woff2' },
];

const IMAGE_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * The photograph the band carries: the building the sign-in screen opens on.
 *
 * It is one of the frontend's own assets rather than anything in the database,
 * so the document's hero band looks like the workspace it belongs to on every
 * machine that prints it.
 */
const HERO_PHOTO = path.resolve(
  __dirname,
  '../../../../frontend/public/images/home/hero-tall.jpg',
);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `true` when a value is worth drawing at all — not null, not blank. */
const has = (value) => value !== null && value !== undefined && String(value).trim() !== '';

function fontFaces() {
  const faces = [];

  for (const { weight, file } of FONT_WEIGHTS) {
    try {
      const bytes = fs.readFileSync(path.join(FONT_DIRECTORY, file));
      faces.push(
        `@font-face{font-family:'Vazirmatn';font-weight:${weight};font-style:normal;`
          + `src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');}`,
      );
    } catch {
      // A missing weight falls back to a synthesised one; the document still
      // prints, so this is not worth failing the request over.
    }
  }

  return faces.join('\n');
}

function stylesheet() {
  try {
    return fs.readFileSync(STYLESHEET_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      `The contract stylesheet is missing at ${STYLESHEET_PATH}: ${error.message}`,
    );
  }
}

/**
 * One of our own image files as a data URL, or null.
 *
 * The bytes travel inside the document because the renderer has no server to
 * ask. A file that has since been deleted is simply not drawn: a contract is
 * complete without a picture, and a broken image on a legal document is worse
 * than no image at all.
 */
function fileDataUrl(absolute) {
  if (!absolute) return null;

  const mime = IMAGE_MIME_TYPES[path.extname(absolute).toLowerCase()];
  if (!mime) return null;

  try {
    return `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`;
  } catch {
    return null;
  }
}

/** The mark beside the office's name: its logo when it has one, else a block. */
function brandMark(logoUrl) {
  const dataUrl = fileDataUrl(resolveUpload(logoUrl));
  if (!dataUrl) return '<span class="contract-brand-mark" aria-hidden="true"></span>';

  return `<img class="contract-brand-logo" src="${dataUrl}" alt=""/>`;
}

/** The building photograph for the band, or nothing if the file is gone. */
function heroPhoto() {
  return fileDataUrl(HERO_PHOTO);
}

/**
 * One labelled value of the hero band's own corner — the contract's number,
 * the day it was drawn.
 */
function heroItem(label, value) {
  if (!has(value)) return '';

  return '<p class="contract-hero-item">'
    + (has(label) ? `<span class="contract-hero-label">${escapeHtml(label)}</span> ` : '')
    + `<span class="contract-hero-value">${escapeHtml(value)}</span>`
    + '</p>';
}

/**
 * The hero band: the office's name and mark, the document's own name in display
 * type, and the contract's number and date beneath it — beside the building the
 * workspace is about.
 */
function heroBand({ name, logoUrl, title, meta, photo }) {
  return '<header class="contract-hero">'
    + '<div class="contract-hero-copy">'
    + `<p class="contract-brand">${brandMark(logoUrl)}`
    + (has(name) ? `<span class="contract-brand-name">${escapeHtml(name)}</span>` : '')
    + '</p>'
    + `<h1 class="contract-title">${escapeHtml(title)}</h1>`
    + `<div class="contract-hero-meta">${meta.join('')}</div>`
    + '</div>'
    + (photo
      ? `<div class="contract-hero-photo" aria-hidden="true"><img src="${photo}" alt=""/></div>`
      : '')
    + '</header>';
}

/**
 * The strip under the band: who lets, who rents, and the day the tenancy
 * begins. The start of the term is set in a pill, as the printed form sets the
 * one value a reader looks for.
 */
function partiesStrip(parties) {
  const drawn = parties
    .map(({ label, value, pill }) => {
      if (!has(value)) return '';
      const className = pill ? 'contract-party-value contract-pill' : 'contract-party-value';

      return '<div class="contract-party">'
        + (has(label) ? `<p class="contract-party-label">${escapeHtml(label)}</p>` : '')
        + `<p class="${className}">${escapeHtml(value)}</p>`
        + '</div>';
    })
    .filter(has)
    .join('');

  return drawn ? `<section class="contract-parties">${drawn}</section>` : '';
}

/**
 * One section of the body: a display heading, an optional line saying what the
 * section holds, then whatever it contains.
 */
function section(title, body, { panel = false, hint = '' } = {}) {
  if (!has(body)) return '';

  return '<section class="contract-section">'
    + (has(title) ? `<h2 class="contract-section-title">${escapeHtml(title)}</h2>` : '')
    + (has(hint) ? `<p class="contract-section-hint">${escapeHtml(hint)}</p>` : '')
    + (panel ? `<div class="contract-panel">${body}</div>` : body)
    + '</section>';
}

/**
 * Labelled facts, one to a line: the caption in bold, its value after it — the
 * shape of a filled-in form rather than a table.
 */
function facts(items) {
  const drawn = items
    .filter(([, value]) => has(value))
    .map(([label, value]) => '<div class="contract-fact">'
      + (has(label) ? `<dt class="contract-fact-label">${escapeHtml(label)}:</dt>` : '')
      + `<dd class="contract-fact-value">${escapeHtml(value)}</dd>`
      + '</div>')
    .join('');

  return drawn ? `<dl class="contract-facts">${drawn}</dl>` : '';
}

/**
 * The unit's address as the form writes it: the unit and the floor it is on,
 * then the building and the street that building stands on, separated the way
 * the contract's own language separates a list.
 *
 * It is one value rather than four, because that is what an address is — where
 * to go — and the form reads "Address: Unit 3, Floor 4, 123 Any St." for the
 * same reason: a reader is being told one thing, not four.
 */
function unitAddress({ apartment, floor, building, labels, digits }) {
  const separator = has(labels.addressSeparator) ? `${labels.addressSeparator} ` : ' ';

  const parts = [
    has(apartment.apartmentNumber)
      ? `${labels.apartmentNumber} ${digits(apartment.apartmentNumber)}`.trim()
      : '',
    has(floor.floorNumber) ? `${labels.floor} ${digits(floor.floorNumber)}`.trim() : '',
    digits(building.name),
    digits(building.address),
  ].filter(has);

  return parts.join(separator);
}

/**
 * The unit's own description, set beside the building it is in: the facts in a
 * tinted panel, and the workspace's photograph of the property at the end of the
 * row, as the band's photograph is.
 */
function premisesSection({ title, hint, photo, items }) {
  const drawn = facts(items);
  if (!has(drawn)) return '';

  return '<section class="contract-section">'
    + (has(title) ? `<h2 class="contract-section-title">${escapeHtml(title)}</h2>` : '')
    + (has(hint) ? `<p class="contract-section-hint">${escapeHtml(hint)}</p>` : '')
    + '<div class="contract-premises">'
    + `<div class="contract-panel">${drawn}</div>`
    + (photo
      ? `<div class="contract-premises-photo" aria-hidden="true"><img src="${photo}" alt=""/></div>`
      : '')
    + '</div></section>';
}

/** One labelled value on its own line, for a section that states a term. */
function line(label, value) {
  if (!has(value)) return '';

  return '<p class="contract-line">'
    + (has(label) ? `<span class="contract-line-label">${escapeHtml(label)}</span> ` : '')
    + `<span class="contract-line-value">${escapeHtml(value)}</span>`
    + '</p>';
}

/**
 * A ruled table. A cell is either `{ text }` — escaped here — or `{ html }`,
 * for a cell that is more than a value: the fixed part of a charge, with the
 * small print that qualifies it under it.
 */
function table(head, rows) {
  if (rows.length === 0) return '';

  const headCells = head
    .map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`)
    .join('');

  const bodyRows = rows
    .map((cells) => `<tr>${cells
      .map((cell) => `<td>${has(cell.html) ? cell.html : escapeHtml(cell.text)}</td>`)
      .join('')}</tr>`)
    .join('');

  return `<table class="contract-table"><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

/** The words one charge is billed under: the service fee, or a metered utility. */
function chargeName(key, labels) {
  if (key === 'SERVICE_FEE') return labels?.serviceFee || '';
  return labels?.utilities?.[key] || '';
}

/** The numbered conditions. A condition with a heading prints it; others do not. */
function clauseList(clauses) {
  const items = clauses
    .map((clause) => '<li class="contract-clause">'
      + `<span class="contract-clause-num" aria-hidden="true">${escapeHtml(clause.number)}</span>`
      + '<div class="contract-clause-text">'
      + (has(clause.title) ? `<h3 class="contract-clause-title">${escapeHtml(clause.title)}</h3>` : '')
      + `<p class="contract-clause-body">${escapeHtml(clause.body)}</p>`
      + '</div></li>')
    .join('');

  return items ? `<ol class="contract-terms-list">${items}</ol>` : '';
}

/**
 * The notes: one note per line, numbered by the document rather than by whoever
 * typed it, so renumbering happens on its own when a note is inserted.
 */
function noteList(text, digits) {
  const notes = String(text ?? '')
    .split('\n')
    .map((note) => note.trim())
    .filter((note) => note !== '');

  const items = notes
    .map((note, index) => '<li class="contract-note">'
      + `<span class="contract-note-num" aria-hidden="true">${escapeHtml(digits(index + 1))}</span>`
      + `<p class="contract-note-body">${escapeHtml(note)}</p></li>`)
    .join('');

  return items ? `<ol class="contract-notes-list">${items}</ol>` : '';
}

/**
 * One signature panel: room to sign, who is signing, the name that goes with
 * it, and the day the contract was drawn.
 */
function signaturePanel({ role, name, date }) {
  return '<div class="contract-signature">'
    + '<span class="contract-signature-rule" aria-hidden="true"></span>'
    + `<p class="contract-signature-role">${escapeHtml(role)}</p>`
    + (has(name) ? `<p class="contract-signature-name">${escapeHtml(name)}</p>` : '')
    + (has(date) ? `<p class="contract-signature-date">${escapeHtml(date)}</p>` : '')
    + '</div>';
}

/**
 * The office's own closing line, resting on the foot of the sheet.
 *
 * It is the office's wording, not a field of the tenancy: the contact details the
 * workspace holds for the office are deliberately not printed here. A contract
 * that is signed, scanned and filed outlives a phone number, and every stale
 * number on paper is a tenant sent to the wrong place. A tenant who needs the
 * office has the lease itself.
 */
function footNote(note) {
  if (!has(note)) return '';

  return '<footer class="contract-foot">'
    + `<p class="contract-foot-note">${escapeHtml(note)}</p>`
    + '</footer>';
}

function buildDocument({ contract, language, labels = {} }) {
  const digits = (value) => toDocumentDigits(value, language);
  const renter = contract.tenant;
  const lessor = contract.lessor;
  const apartment = contract.apartment;
  const building = contract.building;
  const floor = contract.floor;
  const lease = contract.lease;
  const body = contract.body;

  const text = (sectionName) => digits(body[sectionName][language] || body[sectionName].en || '');
  const heading = (sectionName) => body[sectionName][language] || body[sectionName].en || '';

  /*
   * The signatures. Each is captioned with the office's own wording when it has
   * written one, and with the contract's language when it has not — which is why
   * a Dari contract names its signers in Dari even though a caption typed into
   * the settings page can only be in one language.
   */
  const signatureFor = (role, override, name) => signaturePanel({
    role: has(override) ? override : role,
    name,
    date: digits(contract.generatedAtLabel),
  });

  const clauses = contract.clauses.map((clause) => ({
    number: digits(clause.number),
    title: clause.title[language] || clause.title.en,
    body: digits(clause.body[language] || clause.body.en),
  }));

  const notes = [text('notes'), has(lease.notes) ? digits(lease.notes) : '']
    .filter(has)
    .join('\n');

  const terms = [
    line(labels.startDate, digits(lease.startDateLabel)),
    line(labels.endDate, digits(lease.endDateLabel)),
    line(
      labels.period,
      has(lease.durationMonths) ? `${digits(lease.durationMonths)} ${labels.months || ''}`.trim() : '',
    ),
    line(labels.securityDeposit, digits(lease.securityDepositLabel)),
  ].join('');

  /*
   * The workspace's own photograph of the property — the building the sign-in
   * screen opens on — inlined once and used in both places it appears: the band
   * at the head of the document, and beside the unit's description.
   */
  const buildingPhoto = heroPhoto();

  /*
   * The charges the unit carries, as the office's form lists them. The lease's
   * month-by-month rent schedule is deliberately *not* drawn: what a tenancy
   * falls due is a matter for the ledger, which keeps it current, and a table of
   * months and payment states printed on a signed page goes stale the first time
   * a payment is late. The contract states the term and what the unit is let
   * for; the months live on the lease's own screen.
   */
  const charges = table(
    [labels.service, labels.paidBy],
    contract.utilities.map((row) => [
      {
        html: escapeHtml(digits(chargeName(row.key, labels)))
          + (has(row.detail) ? `<span class="contract-table-note">${escapeHtml(digits(row.detail))}</span>` : ''),
      },
      { text: labels.tenant },
    ]),
  );

  /*
   * The document, section by section. A section with nothing to say is not
   * drawn at all — a lease with no meters has no charges table, and a contract
   * with no notes ends at its signatures rather than at an empty heading.
   */
  const sections = [
    premisesSection({
      title: labels.premisesTitle,
      hint: labels.premisesHint,
      photo: buildingPhoto,
      items: [
        [labels.buildingAddress, unitAddress({ apartment, floor, building, labels, digits })],
        [labels.area, digits(apartment.areaLabel)],
        [labels.bedrooms, digits(apartment.bedrooms)],
        [labels.bathrooms, digits(apartment.bathrooms)],
      ],
    }),
    section(labels.statementTitle, `<p class="contract-prose">${escapeHtml(text('preamble'))}</p>`),
    section(labels.utilitiesTitle, charges),
    section(labels.termTitle, terms, { panel: true }),
    section(labels.maintenanceTitle, `<p class="contract-prose">${escapeHtml(text('inventory'))}</p>`),
    section(heading('termsTitle'), clauseList(clauses), { panel: true }),
    section(heading('notesTitle'), noteList(notes, digits)),
    `<section class="contract-section"><h2 class="contract-section-title">${escapeHtml(labels.signaturesTitle || '')}</h2>`
      + '<div class="contract-signatures">'
      + signatureFor(labels.tenantSignature, contract.signatureLabels.tenant, renter.fullName)
      + signatureFor(labels.lessorSignature, contract.signatureLabels.lessor, lessor.name || contract.office.name || contract.organization.name)
      + signatureFor(labels.witnessSignature, contract.signatureLabels.witness, '')
      + '</div></section>',
  ].filter(has);

  return `<!doctype html>
<html lang="${escapeHtml(language)}" dir="${language === 'en' ? 'ltr' : 'rtl'}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(contract.title[language] || contract.title.en)} ${escapeHtml(lease.contractNumberLabel)}</title>
<style>
${fontFaces()}
html,body{margin:0;padding:0;background:#fff;}
body{font-family:'Vazirmatn',system-ui,sans-serif;color:#172033;}
${stylesheet()}
/* The page box: A4, with no margin at the top or the sides. The letterhead band
   is drawn to the paper's edge, and the sheet takes the 16mm its own body is
   inset by on top of its width to reach it — so the band bleeds and the body
   beneath it does not, which is the relationship the page has on screen too.

The foot is the one margin that stays on the page rather than on the sheet. A
page's own margin is the one clearance that cannot push a page; carried as the
sheet's padding it would follow the contract onto a blank page of its own
whenever the contract ended near the foot of one.

These are the paper's measurements, and they are stated unconditionally rather
than inside a print media query, so the sheet is A4 whatever media the renderer
resolves. The sheet's own rules for paper live in the document's shared
stylesheet, which is inlined above and is the same one the browser's Print
command reads. */
@page{size:A4 portrait;margin:0 0 15mm;}
.contract-sheet{--doc-bleed:16mm;zoom:1 !important;box-sizing:border-box;width:210mm;min-height:calc(297mm - 15mm);margin:0;padding:0 16mm;border:0;box-shadow:none;}
.contract-hero{width:calc(100% + (var(--doc-bleed) * 2));margin-inline:calc(-1 * var(--doc-bleed));}
/* The frame is the sheet less the foot the page keeps clear, so the office's
   contact line rests on the foot of the last page when the contract leaves room. */
.contract-frame{min-height:calc(297mm - 15mm);}
</style>
</head>
<body>
<article class="contract-sheet" dir="${language === 'en' ? 'ltr' : 'rtl'}" lang="${escapeHtml(language)}">
<div class="contract-frame">

${heroBand({
    name: has(contract.office.name) ? contract.office.name : contract.organization.name,
    logoUrl: contract.office.logoUrl,
    title: contract.title[language] || contract.title.en,
    photo: buildingPhoto,
    meta: [
      heroItem(labels.contractNumber, digits(lease.contractNumberLabel)),
      heroItem(labels.issuedOn, digits(contract.generatedAtLabel)),
    ],
  })}

${partiesStrip([
    { label: labels.lessor, value: lessor.name || contract.office.name || contract.organization.name },
    { label: labels.tenant, value: renter.fullName },
    { label: labels.leaseStartDate, value: digits(lease.startDateLabel), pill: true },
  ])}

${sections.join('\n')}

${footNote(contract.footerText)}

</div>
</article>
</body>
</html>`;
}

module.exports = { buildDocument, escapeHtml };
