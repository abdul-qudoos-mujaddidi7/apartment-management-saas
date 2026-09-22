CREATE TABLE `SecurityDepositTransaction` (
  `id` VARCHAR(191) NOT NULL, `organizationId` VARCHAR(191) NOT NULL, `leaseId` VARCHAR(191) NOT NULL,
  `type` ENUM('RECEIVED','DEDUCTION','REFUND') NOT NULL, `amount` DECIMAL(15,2) NOT NULL, `transactionDate` DATETIME(3) NOT NULL,
  `reference` VARCHAR(191) NULL, `notes` TEXT NULL, `status` ENUM('POSTED','VOIDED') NOT NULL DEFAULT 'POSTED',
  `voidReason` TEXT NULL, `voidedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), INDEX `SecurityDepositTransaction_organizationId_idx`(`organizationId`), INDEX `SecurityDepositTransaction_leaseId_idx`(`leaseId`), INDEX `SecurityDepositTransaction_organizationId_leaseId_idx`(`organizationId`,`leaseId`), INDEX `SecurityDepositTransaction_type_idx`(`type`), INDEX `SecurityDepositTransaction_status_idx`(`status`), INDEX `SecurityDepositTransaction_transactionDate_idx`(`transactionDate`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `SecurityDepositTransaction` ADD CONSTRAINT `SecurityDepositTransaction_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SecurityDepositTransaction` ADD CONSTRAINT `SecurityDepositTransaction_leaseId_fkey` FOREIGN KEY (`leaseId`) REFERENCES `Lease`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
