-- A charge is stated in the currency it was agreed in: the rent in the lease's
-- rent currency, the service fee in the fee's own currency, a utility charge in
-- the base currency the meter was priced in. An invoice therefore no longer has
-- one currency of its own — it adds its lines up in the organization's base
-- currency, and each line remembers the currency and rate it was posted at.
ALTER TABLE `InvoiceItem`
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
  ADD COLUMN `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
  ADD COLUMN `baseAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

CREATE INDEX `InvoiceItem_currency_idx` ON `InvoiceItem`(`currency`);

-- Existing lines carry no currency of their own: they were all stated in their
-- invoice's currency at the rate frozen onto that invoice, which is exactly the
-- figure the base mirror has to hold for the historical totals to stay put.
UPDATE `InvoiceItem` AS `i`
JOIN `Invoice` AS `v` ON `v`.`id` = `i`.`invoiceId`
SET
  `i`.`currency` = `v`.`currency`,
  `i`.`exchangeRate` = `v`.`exchangeRate`,
  `i`.`baseAmount` = ROUND(`i`.`amount` * `v`.`exchangeRate`, 2);
