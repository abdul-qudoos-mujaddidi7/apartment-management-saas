/**
 * Turning a report into a file the browser saves.
 *
 * One entry point for both formats, because the two writers have to behave the
 * same way from the outside: same stamp on the file name, same failure story,
 * same "once, not twice" guard. A page therefore says *what* it is exporting
 * and never how — which is what keeps twelve pages from growing twelve subtle
 * differences in when a button disables and what a double click does.
 *
 * The writers themselves are imported lazily. The Excel one is small, but the
 * PDF one pulls in jsPDF and autoTable, and neither belongs in the bundle a
 * tenant downloads on first paint.
 */

import { createReport, stampedFileName } from './model.js';

export const FORMATS = {
  excel: {
    labelKey: 'excel',
    extension: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    build: (report) => import('./excel.js').then(({ buildXlsx }) => buildXlsx(report))
  },
  pdf: {
    labelKey: 'pdf',
    extension: 'pdf',
    mime: 'application/pdf',
    build: (report) => import('./pdf.js').then(({ buildPdf }) => buildPdf(report))
  }
};

/**
 * Build and save a report.
 *
 * @param {object} spec        A `createReport` spec.
 * @param {'excel'|'pdf'} format
 * @param {{ language?: string }} [options]  The interface language, which sets
 *   the report's direction and its dates.
 * @returns {Promise<{ fileName: string }>} the name the file was saved under.
 */
export async function exportReport(spec, format, options = {}) {
  const writer = FORMATS[format];
  if (!writer) throw new Error(`Unknown export format: ${format}`);

  const report = createReport({ ...spec, language: spec.language || options.language });
  const output = await writer.build(report);
  const fileName = stampedFileName(report, writer.extension);

  save(output instanceof Blob ? output : new Blob([output], { type: writer.mime }), fileName);
  return { fileName };
}

/** Hand the bytes to the browser, and take the temporary URL back. */
function save(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // A moment, not a promise: Safari needs the URL alive until the save starts.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { createReport };
