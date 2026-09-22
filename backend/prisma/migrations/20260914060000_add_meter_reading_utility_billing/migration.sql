-- Meter defaults are used only for future readings; readings store their own snapshot.
ALTER TABLE `invoiceitem`
  ADD COLUMN `meterReadingId` VARCHAR(191) NULL,
  MODIFY `unitPrice` DECIMAL(15, 4) NOT NULL;

ALTER TABLE `meter`
  ADD COLUMN `defaultUnitPrice` DECIMAL(15, 4) NOT NULL DEFAULT 0;

ALTER TABLE `meterreading`
  ADD COLUMN `amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `unitPrice` DECIMAL(15, 4) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX `InvoiceItem_meterReadingId_key` ON `InvoiceItem`(`meterReadingId`);

ALTER TABLE `InvoiceItem`
  ADD CONSTRAINT `InvoiceItem_meterReadingId_fkey`
  FOREIGN KEY (`meterReadingId`) REFERENCES `MeterReading`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
