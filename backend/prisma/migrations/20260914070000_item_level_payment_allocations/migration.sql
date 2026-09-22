-- Migration: item-level payment allocations
-- PaymentAllocation now points to InvoiceItem instead of Invoice.
-- Ran against existing dev data: backfilled each allocation to the first
-- InvoiceItem of its invoice.

-- 1. Add invoiceItemId column (nullable temporarily)
ALTER TABLE `PaymentAllocation`
  ADD COLUMN `invoiceItemId` VARCHAR(191) NULL;

-- 2. Backfill existing allocations to the first InvoiceItem of each invoice.
UPDATE `PaymentAllocation` pa
  INNER JOIN (
    SELECT pa2.id AS allocationId,
           (SELECT ii.id FROM `InvoiceItem` ii
            WHERE ii.invoiceId = pa2.invoiceId
            ORDER BY ii.createdAt ASC LIMIT 1) AS firstItemId
    FROM `PaymentAllocation` pa2
  ) backfill ON backfill.allocationId = pa.id AND backfill.firstItemId IS NOT NULL
  SET pa.invoiceItemId = backfill.firstItemId;

-- 3. Make invoiceItemId NOT NULL
ALTER TABLE `PaymentAllocation`
  MODIFY COLUMN `invoiceItemId` VARCHAR(191) NOT NULL;

-- 4. Drop old foreign key (on paymentId, referenced the old unique index)
ALTER TABLE `PaymentAllocation`
  DROP FOREIGN KEY `PaymentAllocation_paymentId_fkey`;

-- 5. Drop old unique index and old regular index
ALTER TABLE `PaymentAllocation`
  DROP INDEX `PaymentAllocation_paymentId_invoiceId_key`;
ALTER TABLE `PaymentAllocation`
  DROP INDEX `PaymentAllocation_invoiceId_voidedAt_idx`;

-- 6. Add new indexes
ALTER TABLE `PaymentAllocation`
  ADD UNIQUE INDEX `PaymentAllocation_paymentId_invoiceItemId_key` (`paymentId`, `invoiceItemId`);
ALTER TABLE `PaymentAllocation`
  ADD INDEX `PaymentAllocation_invoiceItemId_voidedAt_idx` (`invoiceItemId`, `voidedAt`);

-- 7. Drop old invoiceId column
ALTER TABLE `PaymentAllocation`
  DROP COLUMN `invoiceId`;

-- 8. Re-add the paymentId foreign key
ALTER TABLE `PaymentAllocation`
  ADD CONSTRAINT `PaymentAllocation_paymentId_fkey`
  FOREIGN KEY (`paymentId`) REFERENCES `payment` (`id`) ON UPDATE CASCADE;

-- NOTE: Prisma will auto-generate the invoiceItemId foreign key from the schema.
