-- An apartment's standard terms, recorded once so every lease raised on it
-- starts from the same numbers: the deposit it is let against, and the service
-- fee it carries. Each amount keeps its own currency, because a deposit is
-- often agreed in a different currency from the rent — the same reason
-- `Lease.securityDepositCurrency` exists.
--
-- Existing apartments keep their meaning: their new rates are stated in the
-- currency their rent already is, and the amounts start at zero so nothing is
-- retroactively treated as owed.
--
-- Run once against the production database:
--   mysql --database=<db> < 20260924120000_add_apartment_security_deposit_and_service_fee/migration.sql
-- (or `npx prisma migrate deploy`, which applies any migration not yet recorded
-- in `_prisma_migrations`).

ALTER TABLE `Apartment`
  ADD COLUMN `securityDeposit` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `securityDepositCurrency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
  ADD COLUMN `serviceFee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `serviceFeeCurrency` VARCHAR(3) NOT NULL DEFAULT 'AFN';

UPDATE `Apartment`
SET
  `securityDepositCurrency` = `rentCurrency`,
  `serviceFeeCurrency` = `rentCurrency`;
