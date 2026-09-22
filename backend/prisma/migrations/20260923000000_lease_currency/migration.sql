-- Migration: a lease states the currency its rent is agreed in
--
-- `monthlyRent` and `securityDeposit` are now understood to be in `currency`.
-- A lease deliberately carries no exchange rate: rent is billed month by month,
-- so each invoice is priced at the rate in force on its own date and freezes
-- that rate onto itself. That is what keeps a USD lease billed across an AFN
-- rate change historically correct.
--
-- Every existing lease was agreed in its organization's reporting currency,
-- which for the organizations created before multi-currency existed is AFN, so
-- the backfill joins the organization rather than assuming one code. No stored
-- amount changes: the numbers already meant "in the reporting currency", they
-- simply had no column saying so.

ALTER TABLE `Lease`
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN';

UPDATE `Lease` l
  INNER JOIN `Organization` o ON o.id = l.organizationId
  SET l.currency = o.baseCurrency;
