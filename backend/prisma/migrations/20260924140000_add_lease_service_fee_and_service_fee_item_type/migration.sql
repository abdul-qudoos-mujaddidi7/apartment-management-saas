-- A lease now states the recurring service fee it bills alongside the rent, in
-- its own currency, and an invoice line may charge that fee as a first-class
-- item type rather than as "other".
--
-- The service fee is the apartment's term, agreed once, so every lease that
-- already exists is backfilled from the apartment it was raised on. That read
-- assumes 20260924120000_add_apartment_security_deposit_and_service_fee has
-- been applied first — `npx prisma migrate deploy` orders the files by name and
-- does that for you; running the files by hand means running that one first.
--
-- Run once against the production database:
--   mysql --database=<db> < 20260924140000_add_lease_service_fee_and_service_fee_item_type/migration.sql
-- (or `npx prisma migrate deploy`, then `npx prisma generate`).

ALTER TABLE `Lease`
  ADD COLUMN `serviceFee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `serviceFeeCurrency` VARCHAR(3) NOT NULL DEFAULT 'AFN';

UPDATE `Lease` AS `l`
JOIN `Apartment` AS `a` ON `a`.`id` = `l`.`apartmentId`
SET
  `l`.`serviceFee` = `a`.`serviceFee`,
  `l`.`serviceFeeCurrency` = `a`.`serviceFeeCurrency`
WHERE `a`.`serviceFee` > 0;

-- Adding a value to the end of the enum keeps every stored type readable. The
-- column is an enum, not a lookup table, so this is the only place the new
-- value has to be declared on the database side.
ALTER TABLE `InvoiceItem`
  MODIFY COLUMN `type` ENUM('RENT', 'ELECTRICITY', 'WATER', 'GAS', 'OTHER', 'SERVICE_FEE') NOT NULL;
