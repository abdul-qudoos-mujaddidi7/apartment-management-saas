/**
 * The PDF writer — jsPDF and autoTable, wearing the console's own palette.
 *
 * Both libraries are loaded on demand, never on first paint: they are ~350 KB
 * and a tenant who never exports should never download them. This file is the
 * only place they are named.
 *
 * Everything the document needs is read from the report — identity, metrics,
 * columns and rows — so a PDF and the spreadsheet of the same list carry the
 * same title, the same column names and the same figures. The page is dressed
 * to match the console: a deep-blue identity band, a soft strip of metric
 * chips, a solid-blue header row, hairline rows, and a totals band in the
 * accent tint. When the interface is in Dari or Pashto the whole document
 * mirrors — the columns reverse and text aligns to the right — because a
 * report written in those languages is read from the right.
 */

import { displayCell, horizontalAlign } from './model.js';

const FONT = 'Vazirmatn';
const REGULAR_FONT_FILE = 'Vazirmatn-Regular.ttf';
const BOLD_FONT_FILE = 'Vazirmatn-Bold.ttf';
const FONT_PATH = '/fonts/vazirmatn/';

/** A4 in points, and the gutter the report keeps on every side. */
const PAGE_WIDTH = 595.28;
const PAGE_WIDTH_LANDSCAPE = 841.89;
const MARGIN = 34;

/** Columns above this count need the wide page. */
const LANDSCAPE_AFTER = 6;

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
];

/** The palette the console draws with, in print-safe form. */
const THEME = {
  deep: rgb('#143f85'),
  primary: rgb('#1c58b8'),
  soft: rgb('#f0f7ff'),
  tint: rgb('#e5f1ff'),
  alt: rgb('#fafbfd'),
  line: rgb('#edf1f6'),
  ink: rgb('#1f2937'),
  muted: rgb('#6b7788'),
  bandText: rgb('#cfe4ff'),
  white: rgb('#ffffff')
};

const BAND_HEIGHT = 58;
const SHORT_BAND_HEIGHT = 42;
const CHIP_HEIGHT = 34;
const CHIP_GAP = 8;

/**
 * Render the report.
 *
 * @returns {Promise<Blob>} the `.pdf` bytes.
 */
export async function buildPdf(report) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);

  const landscape = report.columns.length > LANDSCAPE_AFTER;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', compress: true });
  doc.setProperties({
    title: report.title,
    subject: report.subtitle,
    author: report.company || 'ApartmentPro',
    creator: 'ApartmentPro'
  });

  const hasFont = await embedFonts(doc);
  const pageWidth = landscape ? PAGE_WIDTH_LANDSCAPE : PAGE_WIDTH;
  const contentWidth = pageWidth - MARGIN * 2;
  const face = hasFont ? FONT : 'helvetica';

  const bandBottom = drawIdentityBand(doc, report, contentWidth, face);
  const metricsBottom = drawMetrics(doc, report, contentWidth, bandBottom, face);
  drawTable(doc, autoTable, report, { tableTop: metricsBottom + 14, face });
  drawFooters(doc, report, contentWidth, face);

  return doc.output('blob');
}

/* --------------------------------------------------------------------------
   Typeface
   -------------------------------------------------------------------------- */

let fontCache = null;

/**
 * Put Vazirmatn inside the document.
 *
 * The Arabic script in these reports has to be drawn by the same face the
 * console uses — a substituted Latin font renders Dari as disconnected letters,
 * and jsPDF cannot embed the woff2 the browser is served — so the two TTF cuts
 * are fetched from the same public directory and cached for the session.
 *
 * A failure here is not fatal: a Latin report still exports in Helvetica rather
 * than not exporting at all.
 */
async function embedFonts(doc) {
  try {
    const fonts = await loadFonts();
    doc.addFileToVFS(REGULAR_FONT_FILE, fonts.regular);
    doc.addFont(REGULAR_FONT_FILE, FONT, 'normal');
    doc.addFileToVFS(BOLD_FONT_FILE, fonts.bold);
    doc.addFont(BOLD_FONT_FILE, FONT, 'bold');
    doc.setFont(FONT, 'normal');
    return true;
  } catch (error) {
    console.warn('Report PDF fell back to Helvetica:', error.message);
    doc.setFont('helvetica', 'normal');
    return false;
  }
}

function loadFonts() {
  if (fontCache) return fontCache;

  fontCache = (async () => {
    const [regular, bold] = await Promise.all([
      fetch(`${FONT_PATH}${REGULAR_FONT_FILE}`),
      fetch(`${FONT_PATH}${BOLD_FONT_FILE}`)
    ]);
    if (!regular.ok || !bold.ok) throw new Error('the report fonts could not be loaded');

    const [regularBuffer, boldBuffer] = await Promise.all([regular.arrayBuffer(), bold.arrayBuffer()]);
    return { regular: toBase64(regularBuffer), bold: toBase64(boldBuffer) };
  })().catch((error) => {
    // A transient failure should not be remembered as permanent.
    fontCache = null;
    throw error;
  });

  return fontCache;
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // `String.fromCharCode.apply` overflows the argument list on a 120 KB file,
  // so the buffer goes through in 32 KB bites.
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/* --------------------------------------------------------------------------
   Identity band and metric chips
   -------------------------------------------------------------------------- */

/** The deep-blue header: title and scope on the leading side, the organisation on the other. */
function drawIdentityBand(doc, report, contentWidth, face) {
  const hasScope = Boolean(report.subtitle || report.meta.length);
  const height = hasScope || report.company ? BAND_HEIGHT : SHORT_BAND_HEIGHT;
  const top = MARGIN;

  doc.setFillColor(...THEME.deep);
  doc.roundedRect(MARGIN, top, contentWidth, height, 7, 7, 'F');

  // A brighter keyline along the foot of the band separates it from the white
  // page without a shadow, which a printer would render as a grey smear.
  doc.setFillColor(...THEME.primary);
  doc.rect(MARGIN + 14, top + height - 1.4, contentWidth - 28, 1.4, 'F');

  const inset = 15;
  const textX = report.rtl ? MARGIN + contentWidth - inset : MARGIN + inset;
  const align = report.rtl ? 'right' : 'left';

  doc.setFont(face, 'bold');
  doc.setFontSize(16.5);
  doc.setTextColor(...THEME.white);
  doc.text(report.title, textX, top + 25, { align });

  const scope = [report.subtitle, ...report.meta].filter(Boolean).join('   ·   ');
  if (scope) {
    doc.setFont(face, 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(...THEME.bandText);
    doc.text(scope, textX, top + 41, { align, maxWidth: contentWidth - inset * 2 });
  }

  const stampX = report.rtl ? MARGIN + inset : MARGIN + contentWidth - inset;
  const stampAlign = report.rtl ? 'left' : 'right';
  if (report.company) {
    doc.setFont(face, 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...THEME.white);
    doc.text(report.company, stampX, top + 22, { align: stampAlign });
  }
  doc.setFont(face, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...THEME.bandText);
  doc.text(generatedAt(report), stampX, top + 38, { align: stampAlign });

  return top + height;
}

/** Chips are only drawn when the report states figures of its own. */
function drawMetrics(doc, report, contentWidth, top, face) {
  if (!report.metrics.length) return top;

  const perRow = Math.max(1, Math.min(report.metrics.length, Math.floor(contentWidth / 118)));
  const chipWidth = (contentWidth - CHIP_GAP * (perRow - 1)) / perRow;
  let y = top + 12;

  for (let start = 0; start < report.metrics.length; start += perRow) {
    report.metrics.slice(start, start + perRow).forEach((metric, index) => {
      // In RTL the first chip sits at the right edge and the row fills leftwards.
      const position = report.rtl ? perRow - 1 - index : index;
      const x = MARGIN + position * (chipWidth + CHIP_GAP);
      doc.setFillColor(...THEME.soft);
      doc.roundedRect(x, y, chipWidth, CHIP_HEIGHT, 5, 5, 'F');

      const textX = report.rtl ? x + chipWidth - 10 : x + 10;
      const align = report.rtl ? 'right' : 'left';
      doc.setFont(face, 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...THEME.muted);
      doc.text(metric.label, textX, y + 13, { align, maxWidth: chipWidth - 20 });
      doc.setFont(face, 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(...THEME.deep);
      doc.text(displayValue(metric.value), textX, y + 27, { align, maxWidth: chipWidth - 20 });
    });
    y += CHIP_HEIGHT + 6;
  }

  return y - 6;
}

/* --------------------------------------------------------------------------
   The table
   -------------------------------------------------------------------------- */

function drawTable(doc, autoTable, report, { tableTop, face }) {
  // A right-to-left report is read from the right, so the first column of the
  // report is drawn last and every row mirrors with it.
  const columns = report.rtl ? [...report.columns].reverse() : report.columns;
  const order = report.columns.map((_, index) => index);
  const sequence = report.rtl ? order.reverse() : order;
  const asText = (row) => sequence.map((index) => displayCell(report, report.columns[index], row[index]));

  const body = report.rows.map(asText);
  const totals = report.totals ? [asText(report.totals)] : [];

  // Alignment travels with the column, and in RTL a figure hands its edge to
  // the other side, because the whole table has been mirrored around it.
  const columnStyles = {};
  columns.forEach((column, index) => {
    columnStyles[index] = { halign: report.rtl && column.align === 'end' ? 'left' : horizontalAlign(column) };
  });

  const dense = report.columns.length > 9;

  autoTable(doc, {
    startY: tableTop,
    margin: { top: 46, right: MARGIN, bottom: 46, left: MARGIN },
    // A three-column report stretched across the page reads as a poster; a wide
    // one has to use every point it can get.
    tableWidth: report.columns.length <= 3 ? 'wrap' : 'auto',
    head: [columns.map((column) => column.label)],
    body: [...body, ...totals],
    theme: 'plain',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',

    styles: {
      font: face,
      fontStyle: 'normal',
      fontSize: dense ? 7 : 8,
      textColor: THEME.ink,
      lineColor: THEME.line,
      // Horizontal rules only: the console's tables carry no grid, and a grid
      // in print is what makes a list look like a database dump.
      lineWidth: { bottom: 0.6 },
      cellPadding: { top: 4.2, right: 6, bottom: 4.2, left: 6 },
      valign: 'middle',
      overflow: 'linebreak',
      minCellHeight: 8
    },

    headStyles: {
      font: face,
      fontStyle: 'bold',
      fontSize: dense ? 6.8 : 7.4,
      fillColor: THEME.primary,
      textColor: THEME.white,
      lineColor: THEME.primary,
      lineWidth: { top: 0.6, bottom: 0.6 },
      halign: 'center',
      valign: 'middle',
      minCellHeight: 21
    },

    bodyStyles: { fillColor: THEME.white },
    alternateRowStyles: { fillColor: THEME.alt },
    columnStyles,

    didParseCell: (data) => {
      // The closing band is not a row of the list: it is stated in the accent
      // tint, with a rule above it and its figures set bold.
      if (!report.totals || data.section !== 'body' || data.row.index !== body.length) return;
      data.cell.styles.fillColor = THEME.tint;
      data.cell.styles.textColor = THEME.deep;
      data.cell.styles.fontStyle = 'bold';
      data.cell.styles.lineColor = THEME.primary;
      data.cell.styles.lineWidth = { top: 1, bottom: 0.6 };
    }
  });
}

/* --------------------------------------------------------------------------
   Footer
   -------------------------------------------------------------------------- */

function drawFooters(doc, report, contentWidth, face) {
  const pages = doc.getNumberOfPages();

  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const y = doc.internal.pageSize.getHeight() - MARGIN + 4;

    doc.setDrawColor(...THEME.line);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y - 14, MARGIN + contentWidth, y - 14);

    doc.setFont(face, 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...THEME.muted);

    const identity = [report.title, report.company].filter(Boolean).join('  ·  ');
    doc.text(identity, report.rtl ? MARGIN + contentWidth : MARGIN, y, { align: report.rtl ? 'right' : 'left' });
    doc.text(pageLabel(page, pages, report), report.rtl ? MARGIN : MARGIN + contentWidth, y, { align: report.rtl ? 'left' : 'right' });
  }
}

/* --------------------------------------------------------------------------
   Small print
   -------------------------------------------------------------------------- */

function displayValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(value);
}

function generatedAt(report) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${report.rtl ? 'ایجاد شده' : 'Generated'} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function pageLabel(page, pages, report) {
  return report.rtl ? `صفحه ${page} از ${pages}` : `Page ${page} of ${pages}`;
}
