export const accountTabs = ['overview', 'ledger', 'statement'];

export const accountTabIcons = {
  overview: 'bi-info-circle',
  ledger: 'bi-journal-text',
  statement: 'bi-file-earmark-spreadsheet',
};

export function accountTabFromSearch(search) {
  const tab = new URLSearchParams(search).get('tab');
  return accountTabs.includes(tab) ? tab : 'overview';
}
