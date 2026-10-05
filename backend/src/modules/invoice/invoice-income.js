/**
 * Which income account each invoice charge type credits.
 *
 * A charge with no entry here would debit the tenant's receivable and credit
 * nothing, and the ledger refuses an unbalanced entry — so every type the API
 * accepts has to appear here, and every role named here has to exist in the
 * default chart of accounts (`financial-account.service.js`). Both halves of
 * that are held by `invoice.validation.test.js`.
 */
const incomeAccountRoles = {
  RENT: 'RENT_INCOME',
  ELECTRICITY: 'ELECTRICITY_INCOME',
  WATER: 'WATER_INCOME',
  GAS: 'GAS_INCOME',
  SERVICE_FEE: 'SERVICE_FEE_INCOME',
  OTHER: 'OTHER_INCOME',
};

module.exports = { incomeAccountRoles };
