CREATE TABLE `Lease` (
  `id` VARCHAR(191) NOT NULL, `organizationId` VARCHAR(191) NOT NULL, `tenantId` VARCHAR(191) NOT NULL, `apartmentId` VARCHAR(191) NOT NULL,
  `contractNumber` VARCHAR(191) NOT NULL, `startDate` DATETIME(3) NOT NULL, `endDate` DATETIME(3) NOT NULL,
  `monthlyRent` DECIMAL(12,2) NOT NULL, `securityDeposit` DECIMAL(12,2) NOT NULL DEFAULT 0, `paymentDueDay` INTEGER NOT NULL,
  `status` ENUM('DRAFT','ACTIVE','EXPIRED','TERMINATED') NOT NULL DEFAULT 'DRAFT', `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL, `deletedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `Lease_organizationId_contractNumber_key`(`organizationId`,`contractNumber`),
  INDEX `Lease_organizationId_deletedAt_idx`(`organizationId`,`deletedAt`), INDEX `Lease_tenantId_deletedAt_idx`(`tenantId`,`deletedAt`), INDEX `Lease_apartmentId_deletedAt_idx`(`apartmentId`,`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Lease` ADD CONSTRAINT `Lease_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Lease` ADD CONSTRAINT `Lease_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Lease` ADD CONSTRAINT `Lease_apartmentId_fkey` FOREIGN KEY (`apartmentId`) REFERENCES `Apartment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
