-- Additive: legacy readings keep their existing monthly key and monetary data.
ALTER TABLE `MeterReading`
  ADD COLUMN `leaseId` VARCHAR(191) NULL,
  ADD COLUMN `periodStart` DATE NULL,
  ADD COLUMN `currency` VARCHAR(3) NULL,
  ADD COLUMN `readingKind` VARCHAR(20) NOT NULL DEFAULT 'BILLING',
  ADD COLUMN `resetBaseline` DECIMAL(15,3) NULL;

CREATE INDEX `MeterReading_leaseId_idx` ON `MeterReading` (`leaseId`);
ALTER TABLE `MeterReading` ADD CONSTRAINT `MeterReading_leaseId_fkey`
FOREIGN KEY (`leaseId`) REFERENCES `Lease` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing utility charges were denominated in the organization's base currency.
UPDATE `MeterReading` r JOIN `Meter` m ON m.id = r.meterId
JOIN `Apartment` a ON a.id = m.apartmentId JOIN `Organization` o ON o.id = a.organizationId
SET r.currency = o.baseCurrency;

-- Recover only documented historical ownership; never guess the current tenant.
UPDATE `MeterReading` r JOIN `InvoiceItem` i ON i.meterReadingId = r.id
JOIN `Invoice` inv ON inv.id = i.invoiceId SET r.leaseId = inv.leaseId, r.currency = i.currency;

-- Reuse role permissions. Administrators receive these capabilities; other roles
-- must be granted them explicitly, never by falling back to mere authentication.
INSERT IGNORE INTO `Permission` (`id`, `name`, `code`, `createdAt`, `updatedAt`) VALUES
('workflow_lease_view', 'View leases', 'LEASE_VIEW', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('workflow_lease_manage', 'Manage leases', 'LEASE_MANAGE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('workflow_utility_view', 'View utilities', 'UTILITY_VIEW', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('workflow_utility_manage', 'Manage utilities', 'UTILITY_MANAGE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('workflow_invoice_view', 'View invoices', 'INVOICE_VIEW', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('workflow_invoice_manage', 'Manage invoices', 'INVOICE_MANAGE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
INSERT IGNORE INTO `RolePermission` (`id`, `roleId`, `permissionId`, `createdAt`)
SELECT CONCAT('wf_', LEFT(MD5(CONCAT(r.id, p.id)), 28)), r.id, p.id, CURRENT_TIMESTAMP(3)
FROM `Role` r CROSS JOIN `Permission` p
WHERE r.name IN ('ADMIN', 'Admin', 'SUPER_ADMIN', 'OWNER')
AND p.code IN ('LEASE_VIEW', 'LEASE_MANAGE', 'UTILITY_VIEW', 'UTILITY_MANAGE', 'INVOICE_VIEW', 'INVOICE_MANAGE');
