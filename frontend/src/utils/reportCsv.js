// Text beginning with spreadsheet formula operators must remain literal text.
const cell = value => {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) && typeof value !== 'number') text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
export const reportCsv = (headers, rows) => '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
