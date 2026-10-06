CREATE TABLE `Guarantor` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `firstName` VARCHAR(191) NOT NULL,
  `lastName` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(64) NOT NULL,
  `alternatePhone` VARCHAR(64) NULL,
  `nationalId` VARCHAR(64) NULL,
  `address` VARCHAR(500) NULL,
  `notes` TEXT NULL,
  `documentUrl` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `Guarantor_organizationId_deletedAt_idx` (`organizationId`, `deletedAt`),
  INDEX `Guarantor_organizationId_firstName_lastName_idx` (`organizationId`, `firstName`, `lastName`),
  INDEX `Guarantor_organizationId_phone_idx` (`organizationId`, `phone`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Lease` ADD COLUMN `guarantorId` VARCHAR(191) NULL;
CREATE INDEX `Lease_guarantorId_deletedAt_idx` ON `Lease` (`guarantorId`, `deletedAt`);
ALTER TABLE `Guarantor` ADD CONSTRAINT `Guarantor_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Lease` ADD CONSTRAINT `Lease_guarantorId_fkey` FOREIGN KEY (`guarantorId`) REFERENCES `Guarantor` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
