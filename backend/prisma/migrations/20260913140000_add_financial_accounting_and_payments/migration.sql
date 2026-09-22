-- Financial accounts and balanced journals.
CREATE TABLE `FinancialAccount` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE') NOT NULL,
  `isSystem` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `FinancialAccount_organizationId_code_key`(`organizationId`, `code`),
  INDEX `FinancialAccount_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Journal` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `journalNumber` VARCHAR(191) NOT NULL,
  `transactionDate` DATETIME(3) NOT NULL,
  `referenceType` VARCHAR(191) NOT NULL,
  `referenceId` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('POSTED', 'VOIDED') NOT NULL DEFAULT 'POSTED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Journal_organizationId_journalNumber_key`(`organizationId`, `journalNumber`),
  UNIQUE INDEX `Journal_organizationId_referenceType_referenceId_key`(`organizationId`, `referenceType`, `referenceId`),
  INDEX `Journal_organizationId_transactionDate_idx`(`organizationId`, `transactionDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `JournalLine` (
  `id` VARCHAR(191) NOT NULL,
  `journalId` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NULL,
  `debit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `credit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `description` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `JournalLine_journalId_idx`(`journalId`),
  INDEX `JournalLine_accountId_idx`(`accountId`),
  INDEX `JournalLine_tenantId_idx`(`tenantId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Payment` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `leaseId` VARCHAR(191) NULL,
  `paymentNumber` VARCHAR(191) NOT NULL,
  `paymentDate` DATETIME(3) NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `receiveAccountId` VARCHAR(191) NOT NULL,
  `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_MONEY', 'OTHER') NOT NULL,
  `reference` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `status` ENUM('POSTED', 'VOIDED') NOT NULL DEFAULT 'POSTED',
  `voidedAt` DATETIME(3) NULL,
  `voidReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Payment_organizationId_paymentNumber_key`(`organizationId`, `paymentNumber`),
  INDEX `Payment_organizationId_paymentDate_idx`(`organizationId`, `paymentDate`),
  INDEX `Payment_tenantId_status_idx`(`tenantId`, `status`),
  INDEX `Payment_leaseId_idx`(`leaseId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaymentAllocation` (
  `id` VARCHAR(191) NOT NULL,
  `paymentId` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `voidedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PaymentAllocation_paymentId_invoiceId_key`(`paymentId`, `invoiceId`),
  INDEX `PaymentAllocation_invoiceId_voidedAt_idx`(`invoiceId`, `voidedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FinancialAccount` ADD CONSTRAINT `FinancialAccount_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Journal` ADD CONSTRAINT `Journal_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `JournalLine` ADD CONSTRAINT `JournalLine_journalId_fkey` FOREIGN KEY (`journalId`) REFERENCES `Journal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `JournalLine` ADD CONSTRAINT `JournalLine_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `FinancialAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `JournalLine` ADD CONSTRAINT `JournalLine_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_leaseId_fkey` FOREIGN KEY (`leaseId`) REFERENCES `Lease`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_receiveAccountId_fkey` FOREIGN KEY (`receiveAccountId`) REFERENCES `FinancialAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
