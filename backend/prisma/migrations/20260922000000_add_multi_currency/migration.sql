-- Migration: multi-currency foundation
--
-- Adds the currency catalogue, effective-dated rates, and the frozen-rate
-- snapshot columns every money document needs. Existing data is all AFN, so
-- every backfill below is the identity conversion: rate 1, base = original.
--
-- Written by hand so the backfill and the schema change land in one migration
-- that can be reviewed before it runs.

-- 1. Organization gets its reporting currency.
ALTER TABLE `Organization`
  ADD COLUMN `baseCurrency` VARCHAR(3) NOT NULL DEFAULT 'AFN';

-- 2. The currencies an organization trades in.
CREATE TABLE `Currency` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(3) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `symbol` VARCHAR(8) NULL,
  `isBase` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,

  UNIQUE INDEX `Currency_organizationId_code_key`(`organizationId`, `code`),
  INDEX `Currency_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
  INDEX `Currency_organizationId_isActive_idx`(`organizationId`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Effective-dated rates: 1 unit of `currency` = `rate` units of the base.
CREATE TABLE `ExchangeRate` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `currencyId` VARCHAR(191) NOT NULL,
  `rate` DECIMAL(18, 8) NOT NULL,
  `effectiveDate` DATE NOT NULL,
  `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ExchangeRate_currencyId_effectiveDate_key`(`currencyId`, `effectiveDate`),
  INDEX `ExchangeRate_organizationId_effectiveDate_idx`(`organizationId`, `effectiveDate`),
  INDEX `ExchangeRate_currencyId_effectiveDate_idx`(`currencyId`, `effectiveDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Currency`
  ADD CONSTRAINT `Currency_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ExchangeRate`
  ADD CONSTRAINT `ExchangeRate_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ExchangeRate`
  ADD CONSTRAINT `ExchangeRate_currencyId_fkey`
  FOREIGN KEY (`currencyId`) REFERENCES `Currency`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Give every existing organization its base currency row.
--    The id is deterministic so a re-run of this statement is a no-op.
INSERT INTO `Currency` (`id`, `organizationId`, `code`, `name`, `symbol`, `isBase`, `isActive`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('curbase_', o.`id`),
  o.`id`,
  COALESCE(NULLIF(o.`baseCurrency`, ''), 'AFN'),
  COALESCE(NULLIF(o.`baseCurrency`, ''), 'AFN'),
  NULL,
  true,
  true,
  NOW(3),
  NOW(3)
FROM `Organization` o
WHERE o.`deletedAt` IS NULL;

-- 5. Rate 1 for each base currency, so rate lookups always resolve.
INSERT INTO `ExchangeRate` (`id`, `organizationId`, `currencyId`, `rate`, `effectiveDate`, `source`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('ratebase_', c.`id`),
  c.`organizationId`,
  c.`id`,
  1,
  '1970-01-01',
  'MANUAL',
  NOW(3),
  NOW(3)
FROM `Currency` c
WHERE c.`isBase` = true;

-- 6. Invoice: denomination, frozen rate, and base mirrors.
ALTER TABLE `Invoice`
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
  ADD COLUMN `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
  ADD COLUMN `baseSubtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `baseTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `basePaidAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

UPDATE `Invoice`
  SET `baseSubtotal` = `subtotal`,
      `baseTotal` = `total`,
      `basePaidAmount` = `paidAmount`;

CREATE INDEX `Invoice_organizationId_currency_idx` ON `Invoice`(`organizationId`, `currency`);

-- 7. Payment: the receipt's own currency plus its base value.
ALTER TABLE `Payment`
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
  ADD COLUMN `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
  ADD COLUMN `baseAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

UPDATE `Payment` SET `baseAmount` = `amount`;

-- 8. PaymentAllocation: amount stays in the payment's currency; the amount
--    applied to the item carries the invoice's and the base currency's value.
ALTER TABLE `PaymentAllocation`
  ADD COLUMN `appliedAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `baseAppliedAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

UPDATE `PaymentAllocation`
  SET `appliedAmount` = `amount`,
      `baseAppliedAmount` = `amount`;

-- 9. Journal: one currency and one frozen rate per entry.
ALTER TABLE `Journal`
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
  ADD COLUMN `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1;

-- 10. JournalLine: the base mirror that account balances are summed from.
ALTER TABLE `JournalLine`
  ADD COLUMN `baseDebit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `baseCredit` DECIMAL(15, 2) NOT NULL DEFAULT 0;

UPDATE `JournalLine`
  SET `baseDebit` = `debit`,
      `baseCredit` = `credit`;

-- 11. TenantLedgerEntry: the sub-ledger is kept in the base currency.
ALTER TABLE `TenantLedgerEntry`
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
  ADD COLUMN `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1;

-- 12. SecurityDepositTransaction: deposit status is judged in the base currency.
ALTER TABLE `SecurityDepositTransaction`
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
  ADD COLUMN `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
  ADD COLUMN `baseAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

UPDATE `SecurityDepositTransaction` SET `baseAmount` = `amount`;
