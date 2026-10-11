import assert from 'node:assert/strict';
import test from 'node:test';
import { createReport, stampedFileName } from './model.js';
import { buildXlsx } from './excel.js';

/**
 * A reader for exactly the zips this writer makes: stored entries, no comment.
 * Reading the file back with an independent parser is the only way a test can
 * claim the bytes are a workbook rather than "some bytes came out".
 */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();

  // The end-of-central-directory record is the last structured thing in the
  // file; with no archive comment it is the final 22 bytes.
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50, 'the file ends with an end-of-central-directory record');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);

  for (let index = 0; index < count; index++) {
    assert.equal(view.getUint32(offset, true), 0x02014b50, 'central directory entry');
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    assert.equal(view.getUint32(localOffset, true), 0x04034b50, `${name} has a local header`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + size);

    assert.equal(crc32(data), crc, `${name} matches its checksum`);
    entries.set(name, decoder.decode(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The text of every shared string, in the order the sheet indexes them. */
const sharedStrings = (xml) => [...xml.matchAll(/<si>(?:<t[^>]*>([\s\S]*?)<\/t>)?<\/si>/g)].map((match) => match[1] ?? '');

const unescapeXml = (value) => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&');

const SAMPLE = {
  title: 'Invoices',
  subtitle: 'Building A · October 2026',
  company: 'Parkview Estates',
  meta: ['Generated 2026-10-11 09:30'],
  metrics: [
    { label: 'Invoices', value: '12' },
    { label: 'Billed', value: '145,600.00 AFN' },
    { label: 'Outstanding', value: '12,400.00 AFN' }
  ],
  columns: [
    { label: 'Invoice #', kind: 'text' },
    { label: 'Date', kind: 'date' },
    { label: 'Total', kind: 'money' },
    { label: 'Paid', kind: 'money' },
    { label: 'Balance', kind: 'money' }
  ],
  rows: [
    ['INV-1', '2026-09-01', 12000, 5000, 7000],
    ['INV-2', '2026-09-15', 4500.5, 4500.5, 0]
  ],
  totals: ['Total', '', 16500.5, 9500.5, 7000],
  currency: 'AFN',
  language: 'en'
};

test('a workbook is a zip of the parts Excel requires', () => {
  const entries = unzip(buildXlsx(createReport(SAMPLE)));

  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'docProps/core.xml', 'docProps/app.xml']) {
    assert.ok(entries.has(part), `${part} is present`);
  }

  assert.match(entries.get('[Content_Types].xml'), /spreadsheetml\.sheet\.main\+xml/);
  assert.match(entries.get('xl/workbook.xml'), /<sheet name="Invoices"/);
  assert.match(entries.get('docProps/core.xml'), /<dc:creator>Parkview Estates<\/dc:creator>/);
});

test('the sheet is laid out as a document, not a data dump', () => {
  const entries = unzip(buildXlsx(createReport(SAMPLE)));
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  const strings = sharedStrings(entries.get('xl/sharedStrings.xml'));

  // Title, the identity band, the small print, two metric strips (three
  // metrics do not fit five columns in one), a spacer, the header, two data
  // rows and the totals band.
  assert.equal([...sheet.matchAll(/<row /g)].length, 10);
  assert.equal([...sheet.matchAll(/<row r="7" ht="22"/g)].length, 1, 'the header row is the banded one');

  // The title, the scope and the spacer are merged across all five columns;
  // a metric is a merged label beside its merged figure.
  assert.match(sheet, /<mergeCells count="6">/);
  assert.match(sheet, /<mergeCell ref="A1:E1"\/>/);
  assert.match(sheet, /<mergeCell ref="A2:E2"\/>/);
  assert.match(sheet, /<mergeCell ref="A5:B5"\/>/);

  // The header row is frozen with the data filtered beneath it.
  assert.match(sheet, /<pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<autoFilter ref="A7:E9"\/>/);

  // Money is stored as a number, never as the text "12,000.00 AFN".
  assert.match(sheet, /<v>12000<\/v>/);
  assert.match(sheet, /<v>4500.5<\/v>/);
  assert.ok(!strings.includes('12,000.00 AFN'), 'the amount is not written as text');

  // ...while the header states which currency the column is in.
  assert.ok(strings.includes('Total'), 'the column header is a shared string');
  assert.ok(strings.includes('Billed'), 'the metric captions are written');
  assert.ok(strings.includes('145,600.00 AFN'), 'metrics carry the currency marker');

  // The date keeps the Shamsi form the console prints.
  assert.ok(strings.includes('1405/06/10'), '2026-09-01 is written the way the console reads it');

  // Columns are sized, one descriptor each.
  assert.equal([...entries.get('xl/worksheets/sheet1.xml').matchAll(/<col /g)].length, 5);
  // The money columns carry the two-decimal format.
  assert.match(entries.get('xl/styles.xml'), /formatCode="#,##0\.00"/);
});

test('a Dari report opens right-to-left', () => {
  const rtlEntries = unzip(buildXlsx(createReport({ ...SAMPLE, language: 'fa' })));
  const ltrEntries = unzip(buildXlsx(createReport(SAMPLE)));
  const alignment = (sheetXml, style) => new RegExp(`fontId="${style}"[^>]*>\\s*<alignment horizontal="(\\w+)"`).exec(sheetXml)?.[1];

  // The view mirrors...
  assert.match(rtlEntries.get('xl/worksheets/sheet1.xml'), /<sheetView rightToLeft="1"/);
  assert.doesNotMatch(ltrEntries.get('xl/worksheets/sheet1.xml'), /rightToLeft/);

  // ...and so does every cell that has a leading edge: in Dari the title and
  // the metric captions start at the right, and the figures take the left.
  const rtlStyles = rtlEntries.get('xl/styles.xml');
  const ltrStyles = ltrEntries.get('xl/styles.xml');
  assert.equal(alignment(rtlStyles, 1), 'right', 'the title band' );
  assert.equal(alignment(ltrStyles, 1), 'left');
  assert.equal(alignment(rtlStyles, 3), 'right', 'the metric captions');
  // Money: style 7 in LTR, style 10 in the mirrored sheet's row styles.
  assert.match(rtlStyles, /numFmtId="164"(?!.*applyNumberFormat)[\s\S]*?<alignment horizontal="left"/);
  assert.match(ltrStyles, /numFmtId="164"[\s\S]*?<alignment horizontal="right"/);
});

test('text that would break the XML is carried safely', () => {
  const report = createReport({
    title: 'Notes',
    columns: [{ label: 'Note' }],
    rows: [
      ['A & B <tag> "quoted"'],
      ["apostrophe ' and a \u0007 bell"],
      ['control characters \u0000\u001f removed']
    ],
    language: 'en'
  });

  const entries = unzip(buildXlsx(report));
  const strings = sharedStrings(entries.get('xl/sharedStrings.xml')).map(unescapeXml);

  assert.ok(strings.includes('A & B <tag> "quoted"'));
  assert.ok(strings.includes("apostrophe ' and a  bell"), 'the bell is dropped, the text around it survives');
  assert.ok(strings.includes('control characters  removed'), 'the characters vanish, the sentence keeps its words');
  // The bell is illegal in XML 1.0 and would make Excel refuse the whole file.
  assert.doesNotMatch(entries.get('xl/sharedStrings.xml'), /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
});

test('a report with a single column and no metrics still lays out', () => {
  const entries = unzip(buildXlsx(createReport({
    title: 'Currencies',
    columns: ['Code'],
    rows: [['AFN'], ['USD']],
    language: 'en'
  })));
  const sheet = entries.get('xl/worksheets/sheet1.xml');

  // Title, spacer, header and the two rows: five rows of one column.
  assert.match(sheet, /<dimension ref="A1:A5"\/>/);
  assert.doesNotMatch(sheet, /<mergeCells/);
  assert.match(entries.get('xl/sharedStrings.xml'), /AFN/);
});

test('the file name is stamped so two exports never collide', () => {
  const report = createReport({ ...SAMPLE, fileName: 'Invoice List' });
  assert.equal(report.fileName, 'invoice-list');
  assert.equal(stampedFileName(report, 'xlsx', new Date(2026, 9, 11, 9, 5)), 'invoice-list-2026-10-11-0905.xlsx');
});

test('a report with no dates or currency is still well formed', () => {
  const report = createReport({ title: 'Guarantors', columns: [{ label: 'Name' }], rows: [['Nasrin Habibi']], language: 'en' });
  const sheet = unzip(buildXlsx(report)).get('xl/worksheets/sheet1.xml');
  assert.doesNotMatch(sheet, /<autoFilter ref="A\d+:[A-Z]+0"\/>/, 'the filter does not run off the end of the sheet');
});
