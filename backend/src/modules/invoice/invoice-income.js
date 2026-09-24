/**
 * Which income account each invoice charge type credits.
 *
 * A charge with no entry here would debit the tenant's receivable and credit
 * nothing, and the ledger refuses an unbalanced entry — so every type the API
 * accepts has to appear here, and every code named here has to exist in the
 * default chart of accounts (`financial-account.service.js`). Both halves of
 * that are held by `invoice.validation.test.js`.
 */
const incomeAccountCodes = {
  RENT: '4000',
  ELECTRICITY: '4010',
  WATER: '4020',
  GAS: '4030',
  SERVICE_FEE: '4040',
  OTHER: '4090',
};

module.exports = { incomeAccountCodes };
