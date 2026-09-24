/**
 * Which currency a charge is stated in.
 *
 * A charge is always copied from something that already states its money in a
 * currency, so it keeps that currency rather than being converted into the
 * invoice's:
 *
 *   - rent        — the currency the lease states its rent in
 *   - service fee — the fee's own currency, which the lease may state separately
 *   - utilities   — the base currency, because a meter holds one unit price for
 *                   its unit and that price is entered in the base currency
 *   - anything else typed — the base currency, which is all the user can mean
 *
 * The invoice adds those lines up in the base currency, at the rate in force on
 * its own date, so a lease in USD with an electricity reading in AFN bills both
 * without either being restated.
 */
function lineCurrency(item, lease, baseCurrency) {
  const base = baseCurrency || 'AFN';
  if (!item || item.meterReadingId) return base;
  if (item.type === 'RENT') return lease?.currency || base;
  if (item.type === 'SERVICE_FEE') return lease?.serviceFeeCurrency || lease?.currency || base;
  return base;
}

module.exports = { lineCurrency };
