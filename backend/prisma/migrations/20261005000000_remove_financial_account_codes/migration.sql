-- Preserve account IDs and every journal/payment/deposit relationship.
-- Back up production and stop the API before applying this migration.
ALTER TABLE `FinancialAccount` ADD COLUMN `systemKey` VARCHAR(191) NULL;

UPDATE `FinancialAccount`
SET `systemKey` = CASE `code`
  WHEN '1000' THEN 'CASH'
  WHEN '1100' THEN 'ACCOUNTS_RECEIVABLE'
  WHEN '2000' THEN 'SECURITY_DEPOSIT_LIABILITY'
  WHEN '4000' THEN 'RENT_INCOME'
  WHEN '4010' THEN 'ELECTRICITY_INCOME'
  WHEN '4020' THEN 'WATER_INCOME'
  WHEN '4030' THEN 'GAS_INCOME'
  WHEN '4040' THEN 'SERVICE_FEE_INCOME'
  WHEN '4050' THEN 'SECURITY_DEPOSIT_FORFEITED'
  WHEN '4090' THEN 'OTHER_INCOME'
  WHEN '4900' THEN 'FOREIGN_EXCHANGE_DIFFERENCE'
  WHEN '5000' THEN 'BUILDING_EXPENSES'
  ELSE NULL
END;

CREATE UNIQUE INDEX `FinancialAccount_organizationId_systemKey_key`
  ON `FinancialAccount`(`organizationId`, `systemKey`);
DROP INDEX `FinancialAccount_organizationId_code_key` ON `FinancialAccount`;
ALTER TABLE `FinancialAccount` DROP COLUMN `code`;
