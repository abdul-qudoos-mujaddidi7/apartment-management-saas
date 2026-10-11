/**
 * A real .xlsx, written here rather than by a spreadsheet library.
 *
 * The file is OOXML: a zip of XML parts. Writing it by hand costs about the
 * same as importing a 300 KB library, and it buys two things that matter for
 * this product — the export adds nothing to the bundle a tenant downloads on
 * first load, and the layout is ours, so a report exported from here wears the
 * same deep-blue band, soft metric strip and hairline rows the console draws.
 *
 * Numbers stay numbers: a money column is written as a numeric cell with a
 * `#,##0.00` format, not as the string "12,345.00 AFN", so the reader can sum
 * it, sort it and chart it. The column header carries the currency instead.
 *
 * The sheet is a *document*, not a data dump: a title band, the organisation,
 * a metric strip, a frozen header row with an autofilter over the data, and a
 * totals band — and when the interface is in Dari or Pashto the sheet opens
 * right-to-left, the way the report is read.
 */

import { columnWidths, displayCell, rawCell } from './model.js';

/** The palette, in Excel's own `AARRGGBB` notation. */
const INK = {
  text: 'FF1F2937',
  muted: 'FF6B7788',
  bandText: 'FFCFE4FF',
  deep: 'FF143F85',
  primary: 'FF1C58B8',
  soft: 'FFF0F7FF',
  tint: 'FFE5F1FF',
  alt: 'FFFAFBFD',
  line: 'FFEDF1F6',
  white: 'FFFFFFFF'
};

const FONT = 'Vazirmatn';
const MONEY_FORMAT = 164;
const NUMBER_FORMAT = 165;

/* Cell style indexes, as declared by `STYLES` below. Naming them keeps the
   row builder readable and the stylesheet in one place. */
const STYLE = {
  title: 1,
  band: 2,
  metricLabel: 3,
  metricValue: 4,
  header: 5,
  text: 6,
  money: 7,
  number: 8,
  date: 9,
  textAlt: 10,
  moneyAlt: 11,
  numberAlt: 12,
  dateAlt: 13,
  totalText: 14,
  totalMoney: 15,
  totalNumber: 16,
  totalDate: 17,
  spacer: 18
};

/** Row heights, in points. A band is a band; a data row stays scannable. */
const HEIGHT = { title: 34, band: 19, metric: 26, spacer: 8, header: 22, body: 18, total: 22 };

/**
 * Build the workbook.
 *
 * @returns {Uint8Array} the bytes of a `.xlsx` file.
 */
export function buildXlsx(report) {
  const layout = layoutRows(report);
  const width = report.columns.length;
  const lastColumn = columnLetter(width - 1);
  const strings = sharedStrings(layout);
  const headerRow = layout.find((row) => row.role === 'header');
  const firstDataRow = headerRow ? headerRow.number + 1 : 1;
  const lastDataRow = layout.filter((row) => row.role === 'body').at(-1)?.number || firstDataRow;

  const parts = {
    '[Content_Types].xml': contentTypes(),
    '_rels/.rels': rootRelationships(),
    'docProps/core.xml': coreProperties(report),
    'docProps/app.xml': appProperties(),
    'xl/workbook.xml': workbook(report),
    'xl/_rels/workbook.xml.rels': workbookRelationships(),
    'xl/styles.xml': styles(report.rtl),
    'xl/sharedStrings.xml': strings.xml,
    'xl/worksheets/sheet1.xml': sheet(report, layout, {
      widths: columnWidths(report),
      lastColumn,
      frozenAt: firstDataRow,
      filter: `A${headerRow?.number || 1}:${lastColumn}${lastDataRow}`,
      strings: strings.index
    })
  };

  return zip(parts);
}

/* --------------------------------------------------------------------------
   Layout — what goes on which row
   -------------------------------------------------------------------------- */

/**
 * Turn the report into rows of cells, before any XML exists.
 *
 * Each entry is `{ number, role, height, cells: [{ column, style, value, type }] }`.
 * Every cell carries its own style, so a band is a run of cells sharing one
 * fill rather than a thing the writer has to reason about twice.
 */
function layoutRows(report) {
  const width = report.columns.length;
  const rows = [];
  const push = (role, height, cells) => rows.push({ number: rows.length + 1, role, height, cells });

  push('title', HEIGHT.title, [
    { column: 0, span: width, style: STYLE.title, value: report.title, type: 'text' }
  ]);

  /* The band under the title carries who the report is for and what it covers:
     the organisation and the account or filter line, then any further small
     print. It is the same deep fill as the title, so the two read as one band. */
  const identity = [report.company, report.subtitle].filter(Boolean).join('  ·  ');
  const [firstMeta, ...restMeta] = report.meta;
  if (identity || firstMeta) {
    push('band', HEIGHT.band, [
      { column: 0, span: width, style: STYLE.band, value: identity || firstMeta, type: 'text' }
    ]);
    if (restMeta.length || (identity && firstMeta)) {
      const line = identity ? [firstMeta, ...restMeta].filter(Boolean).join('   ·   ') : restMeta.join('   ·   ');
      push('band', HEIGHT.band, [
        { column: 0, span: width, style: STYLE.band, value: line, type: 'text' }
      ]);
    }
  }

  for (const strip of metricStrips(width, report.metrics)) {
    push('metric', HEIGHT.metric, strip);
  }

  push('spacer', HEIGHT.spacer, [{ column: 0, span: width, style: STYLE.spacer, value: '', type: 'text' }]);

  push('header', HEIGHT.header, report.columns.map((column, columnIndex) => ({
    column: columnIndex,
    style: STYLE.header,
    value: column.label,
    type: 'text'
  })));

  report.rows.forEach((row, rowIndex) => {
    const alternate = rowIndex % 2 === 1;
    push('body', HEIGHT.body, report.columns.map((column, columnIndex) => bodyCell(column, columnIndex, row[columnIndex], alternate, false, report)));
  });

  if (report.totals) {
    push('total', HEIGHT.total, report.columns.map((column, columnIndex) => bodyCell(column, columnIndex, report.totals[columnIndex], false, true, report)));
  }

  return rows;
}

/** One data cell, in machine or human form depending on its column. */
function bodyCell(column, columnIndex, value, alternate, total, report) {
  const isFigure = column.kind === 'money' || column.kind === 'number';
  const style = total
    ? column.kind === 'money' ? STYLE.totalMoney : column.kind === 'number' ? STYLE.totalNumber : column.kind === 'date' ? STYLE.totalDate : STYLE.totalText
    : column.kind === 'money' ? (alternate ? STYLE.moneyAlt : STYLE.money)
      : column.kind === 'number' ? (alternate ? STYLE.numberAlt : STYLE.number)
        : column.kind === 'date' ? (alternate ? STYLE.dateAlt : STYLE.textAlt)
          : alternate ? STYLE.textAlt : STYLE.text;

  return {
    column: columnIndex,
    style,
    value: isFigure ? rawCell(column, value) : displayCell(report, column, value),
    // A figure with no value is written as an empty cell, never as the text
    // "—": a dash in a numeric column turns the whole column into text.
    type: isFigure && typeof rawCell(column, value) === 'number' ? 'number' : 'text',
    total
  };
}

/**
 * The metric strip, laid out across the sheet as label/value pairs.
 *
 * Metrics are chips: a small caption over its figure. Excel has no chip, so a
 * chip becomes a soft-filled pair of merged cells, as many per row as the sheet
 * is wide, and the strip is continuous because the trailing cells are filled
 * too.
 */
function metricStrips(width, metrics) {
  if (!metrics.length) return [];
  const perRow = Math.max(1, Math.min(metrics.length, Math.floor(width / 2)));
  const strips = [];

  for (let start = 0; start < metrics.length; start += perRow) {
    const slice = metrics.slice(start, start + perRow);
    const cells = [];
    let column = 0;

    for (const metric of slice) {
      const span = Math.max(2, Math.floor(width / slice.length));
      const labelSpan = Math.max(1, Math.floor(span / 2));
      cells.push({ column, span: labelSpan, style: STYLE.metricLabel, value: metric.label, type: 'text' });
      cells.push({ column: column + labelSpan, span: span - labelSpan, style: STYLE.metricValue, value: metric.value, type: 'text' });
      column += span;
    }

    // The band runs to the sheet's last column even when the metrics do not
    // divide evenly: a chip strip that stops halfway reads as a broken table.
    if (column < width) cells.push({ column, span: width - column, style: STYLE.metricLabel, value: '', type: 'text' });
    strips.push(cells);
  }

  return strips;
}

/* --------------------------------------------------------------------------
   Sheet XML
   -------------------------------------------------------------------------- */

function sheet(report, layout, { widths, lastColumn, frozenAt, filter, strings }) {
  const merges = [];
  const rowsXml = layout.map((row) => {
    const cellsXml = row.cells.map((cell) => {
      if (cell.span > 1) merges.push(`${cellAddress(cell.column, row.number)}:${cellAddress(cell.column + cell.span - 1, row.number)}`);
      return cellXml(cell, row.number, report.rtl, strings);
    }).join('');
    return `<row r="${row.number}" ht="${row.height}" customHeight="1">${cellsXml}</row>`;
  }).join('');

  const columnsXml = widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('');

  const pane = frozenAt > 1
    ? `<pane ySplit="${frozenAt - 1}" topLeftCell="A${frozenAt}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${frozenAt}" sqref="A${frozenAt}"/>`
    : '';

  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${lastColumn}${layout.length}"/>
<sheetViews><sheetView${report.rtl ? ' rightToLeft="1"' : ''} tabSelected="1" workbookViewId="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="${HEIGHT.body}"/>
<cols>${columnsXml}</cols>
<sheetData>${rowsXml}</sheetData>
<autoFilter ref="${filter}"/>
${mergeXml(merges)}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${widths.length > 6 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>&amp;L${escapeXml(report.title)}&amp;R&amp;P / &amp;N</oddFooter></headerFooter>
</worksheet>`);
}

/** Omitted entirely when nothing is merged — an empty element is noise Excel keeps. */
function mergeXml(merges) {
  if (!merges.length) return '';
  return `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`;
}

function cellXml(cell, rowNumber, rtl, strings) {
  const address = cellAddress(cell.column, rowNumber);
  const attributes = `r="${address}" s="${cell.style}"`;

  // A band's trailing cell still has to exist: the fill is the cell, so a
  // missing cell is a gap in the band.
  if (cell.value === '' || cell.value === null || cell.value === undefined) return `<c ${attributes}/>`;
  if (cell.type === 'number') return `<c ${attributes}><v>${cell.value}</v></c>`;
  return `<c ${attributes} t="s"><v>${strings.get(String(cell.value))}</v></c>`;
}

/** Column 0 → A, 26 → AA. */
function columnLetter(index) {
  let letters = '';
  for (let value = index; value >= 0; value = Math.floor(value / 26) - 1) {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
  }
  return letters;
}

const cellAddress = (column, row) => `${columnLetter(column)}${row}`;

/* --------------------------------------------------------------------------
   Shared strings
   -------------------------------------------------------------------------- */

function sharedStrings(layout) {
  const index = new Map();
  const ordered = [];
  const add = (value) => {
    if (value === '' || value === null || value === undefined) return;
    const text = String(value);
    if (!index.has(text)) {
      index.set(text, ordered.length);
      ordered.push(text);
    }
  };

  for (const row of layout) for (const cell of row.cells) if (cell.type === 'text') add(cell.value);
  return { index, xml: sstXml(ordered) };
}

function sstXml(values) {
  const items = values.map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`).join('');
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${values.length}" uniqueCount="${values.length}">${items}</sst>`);
}

/* --------------------------------------------------------------------------
   Static parts — styles, content types, relationships, properties
   -------------------------------------------------------------------------- */

/**
 * The stylesheet: seven type roles, six fills and three borders, composed into
 * one cell format per row role. Anything a writer needs to change about how a
 * report looks is a value in this table, not a branch in the row builder.
 *
 * It is built per report rather than once per module, and only because of
 * direction: in a Dari sheet a title and a caption begin at the right edge, and
 * a cell's alignment is a property of the cell, not of the sheet view.
 */
function styles(rtl) {
  const leading = rtl ? 'right' : 'left';
  // Figures keep the reading edge of the sheet: mirrored, they sit at the
  // outer edge of their column, exactly as the PDF mirror puts them.
  const figures = rtl ? 'left' : 'right';
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="${MONEY_FORMAT}" formatCode="#,##0.00"/><numFmt numFmtId="${NUMBER_FORMAT}" formatCode="#,##0"/></numFmts>
<fonts count="7">
<font><sz val="10"/><color rgb="${INK.text}"/><name val="${FONT}"/></font>
<font><b/><sz val="14"/><color rgb="${INK.white}"/><name val="${FONT}"/></font>
<font><sz val="9.5"/><color rgb="${INK.bandText}"/><name val="${FONT}"/></font>
<font><b/><sz val="8.5"/><color rgb="${INK.muted}"/><name val="${FONT}"/></font>
<font><b/><sz val="12"/><color rgb="${INK.deep}"/><name val="${FONT}"/></font>
<font><b/><sz val="9.5"/><color rgb="${INK.white}"/><name val="${FONT}"/></font>
<font><b/><sz val="10"/><color rgb="${INK.deep}"/><name val="${FONT}"/></font>
</fonts>
<fills count="7">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${INK.deep}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${INK.soft}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${INK.primary}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${INK.alt}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${INK.tint}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="${INK.line}"/></bottom><diagonal/></border>
<border><left/><right/><top style="medium"><color rgb="${INK.primary}"/></top><bottom style="thin"><color rgb="${INK.line}"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="${INK.deep}"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="19">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
${xf({ font: 1, fill: 2, align: leading })}
${xf({ font: 2, fill: 2, align: leading })}
${xf({ font: 3, fill: 3, border: 1, align: leading })}
${xf({ font: 4, fill: 3, border: 1, align: leading })}
${xf({ font: 5, fill: 4, border: 3, align: 'center' })}
${xf({ font: 0, border: 1 })}
${xf({ font: 0, border: 1, numFmt: MONEY_FORMAT, align: figures })}
${xf({ font: 0, border: 1, numFmt: NUMBER_FORMAT, align: figures })}
${xf({ font: 0, border: 1, align: 'center' })}
${xf({ font: 0, fill: 5, border: 1 })}
${xf({ font: 0, fill: 5, border: 1, numFmt: MONEY_FORMAT, align: figures })}
${xf({ font: 0, fill: 5, border: 1, numFmt: NUMBER_FORMAT, align: figures })}
${xf({ font: 0, fill: 5, border: 1, align: 'center' })}
${xf({ font: 6, fill: 6, border: 2 })}
${xf({ font: 6, fill: 6, border: 2, numFmt: MONEY_FORMAT, align: figures })}
${xf({ font: 6, fill: 6, border: 2, numFmt: NUMBER_FORMAT, align: figures })}
${xf({ font: 6, fill: 6, border: 2, align: 'center' })}
${xf({ font: 0, border: 0 })}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
}

/** One `cellXfs` entry. Every cell is vertically centred; figures keep their column's side. */
function xf({ font = 0, fill = 0, border = 0, numFmt = 0, align = 'left' }) {
  const alignment = `<alignment horizontal="${align}" vertical="center" readingOrder="2"/>`;
  return `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${numFmt ? ' applyNumberFormat="1"' : ''}>${alignment}</xf>`;
}

function contentTypes() {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
}

function rootRelationships() {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
}

function workbookRelationships() {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`);
}

function workbook(report) {
  // The sheet name is the tab a reader lands on; the print titles keep the
  // header row on every printed page.
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr/>
<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews>
<sheets><sheet name="${escapeXml(report.sheetName)}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">Sheet1!$1:$1</definedName></definedNames>
<calcPr calcId="171027"/>
</workbook>`);
}

function coreProperties(report) {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${escapeXml(report.title)}</dc:title>
<dc:creator>${escapeXml(report.company || 'ApartmentPro')}</dc:creator>
<cp:lastModifiedBy>${escapeXml(report.company || 'ApartmentPro')}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`);
}

function appProperties() {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>ApartmentPro</Application>
<AppVersion>1.0</AppVersion>
</Properties>`);
}

/* --------------------------------------------------------------------------
   Package plumbing — XML escaping and a stored-entry zip
   -------------------------------------------------------------------------- */

/** Template literals below open on their own line; no part may start with one. */
function xml(value) {
  return value.replace(/^\n/, '');
}

/**
 * Excel rejects a part that carries an XML-illegal character, and the text in
 * these reports comes from what people typed — notes, descriptions, a pasted
 * CSV. Control characters are dropped rather than escaped, because XML 1.0 has
 * no way to write them at all.
 */
function escapeXml(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

/**
 * A zip of stored (uncompressed) entries.
 *
 * Deflate would save a few kilobytes and cost an inflate implementation; a
 * report is a few hundred rows and the browser downloads it over a LAN. Stored
 * entries are also what make the file inspectable — and testable — without a
 * zip library on the other side.
 */
function zip(parts) {
  const encoder = new TextEncoder();
  const chunks = [];
  const directory = [];
  let offset = 0;

  for (const [name, content] of Object.entries(parts)) {
    const nameBytes = encoder.encode(name);
    const bytes = encoder.encode(content);
    const crc = crc32(bytes);
    // A fixed DOS timestamp keeps the bytes of the same report identical, which
    // is what lets a test compare two builds of one export.
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true); // UTF-8 file names
    header.setUint16(8, 0, true); // stored
    header.setUint16(10, 0, true);
    header.setUint16(12, 0x0021, true); // 1980-01-01
    header.setUint32(14, crc, true);
    header.setUint32(18, bytes.length, true);
    header.setUint32(22, bytes.length, true);
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true);

    chunks.push(new Uint8Array(header.buffer), nameBytes, bytes);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, 0, true);
    entry.setUint16(14, 0x0021, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, bytes.length, true);
    entry.setUint32(24, bytes.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    directory.push(new Uint8Array(entry.buffer), nameBytes);

    offset += 30 + nameBytes.length + bytes.length;
  }

  const directorySize = directory.reduce((total, chunk) => total + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(parts).length, true);
  end.setUint16(10, Object.keys(parts).length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);

  return concat([...chunks, ...directory, new Uint8Array(end.buffer)]);
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.length;
  }
  return bytes;
}
