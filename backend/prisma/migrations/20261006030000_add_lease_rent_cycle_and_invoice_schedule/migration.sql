-- A lease now bills on a rent cycle rather than always monthly: it states how
-- many months one invoice covers (default 1, keeping existing leases monthly),
-- when its next invoice is due, and when the last one was raised. An invoice
-- keeps the first day of the period it covers, which is what stops the same
-- period being billed twice.
--
-- Run once against the production database:
--   npx prisma migrate deploy && npx prisma generate
-- (or apply this file by hand; it is the only one that changes these tables).

ALTER TABLE `Lease`
  ADD COLUMN `rentCycleMonths` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `nextInvoiceDate` DATE NULL,
  ADD COLUMN `lastInvoiceDate` DATE NULL;

ALTER TABLE `Invoice`
  ADD COLUMN `billingPeriodStart` DATE NULL;

CREATE INDEX `Lease_status_nextInvoiceDate_idx` ON `Lease`(`status`, `nextInvoiceDate`);

-- One invoice per lease per billing period. MySQL allows many NULLs in a unique
-- index, so invoices raised by hand (which carry no period) are unaffected.
CREATE UNIQUE INDEX `Invoice_leaseId_billingPeriodStart_key` ON `Invoice`(`leaseId`, `billingPeriodStart`);

-- Give every live active lease a schedule so the generator can pick it up. The
-- column above was just added, so every existing row is on the one-month cycle
-- and the first invoice falls one month after the lease began.
UPDATE `Lease`
SET `nextInvoiceDate` = DATE_ADD(`startDate`, INTERVAL 1 MONTH)
WHERE `deletedAt` IS NULL AND `status` = 'ACTIVE';
