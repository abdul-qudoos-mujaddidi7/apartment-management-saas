CREATE TABLE `TenantAccount` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `balance` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `TenantAccount_organizationId_tenantId_key`(`organizationId`, `tenantId`),
  INDEX `TenantAccount_organizationId_balance_idx`(`organizationId`, `balance`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantLedgerEntry` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `tenantAccountId` VARCHAR(191) NOT NULL,
  `type` ENUM('INVOICE', 'PAYMENT', 'DEBIT_ADJUSTMENT', 'CREDIT_ADJUSTMENT', 'REVERSAL') NOT NULL,
  `transactionDate` DATETIME(3) NOT NULL,
  `referenceType` VARCHAR(191) NOT NULL,
  `referenceId` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `debit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `credit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `balanceAfter` DECIMAL(15, 2) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `tenant_ledger_ref_type_uq`(`organizationId`, `referenceType`, `referenceId`, `type`),
  INDEX `TenantLedgerEntry_organizationId_idx`(`organizationId`),
  INDEX `TenantLedgerEntry_tenantAccountId_transactionDate_idx`(`tenantAccountId`, `transactionDate`),
  INDEX `TenantLedgerEntry_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Journal` ADD COLUMN `voidedAt` DATETIME(3) NULL, ADD COLUMN `voidReason` TEXT NULL;
ALTER TABLE `TenantAccount` ADD CONSTRAINT `TenantAccount_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TenantAccount` ADD CONSTRAINT `TenantAccount_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TenantLedgerEntry` ADD CONSTRAINT `TenantLedgerEntry_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TenantLedgerEntry` ADD CONSTRAINT `TenantLedgerEntry_tenantAccountId_fkey` FOREIGN KEY (`tenantAccountId`) REFERENCES `TenantAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
