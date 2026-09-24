-- Existing deposits were denominated in the lease currency. Preserve that
-- meaning while allowing new leases to choose a separate deposit currency.
ALTER TABLE `Lease` ADD COLUMN `securityDepositCurrency` VARCHAR(3) NULL;

UPDATE `Lease`
SET `securityDepositCurrency` = `currency`;

ALTER TABLE `Lease`
MODIFY `securityDepositCurrency` VARCHAR(3) NOT NULL DEFAULT 'AFN';
