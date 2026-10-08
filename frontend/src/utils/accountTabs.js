export const accountTabs = ['overview', 'ledger', 'statement', 'annual', 'documents'];

export const accountTabIcons = {
  overview: 'bi-info-circle',
  ledger: 'bi-journal-text',
  statement: 'bi-file-earmark-spreadsheet',
  annual: 'bi-calendar3',
  documents: 'bi-diagram-3',
};

export function accountTabFromSearch(search) {
  const tab = new URLSearchParams(search).get('tab');
  return accountTabs.includes(tab) ? tab : 'overview';
}
