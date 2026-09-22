-- CreateTable
CREATE TABLE `AssetCategory` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `AssetCategory_organizationId_idx`(`organizationId`),
    INDEX `AssetCategory_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `AssetCategory_organizationId_name_idx`(`organizationId`, `name`),
    INDEX `AssetCategory_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `unit` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Asset_organizationId_idx`(`organizationId`),
    INDEX `Asset_categoryId_idx`(`categoryId`),
    INDEX `Asset_name_idx`(`name`),
    INDEX `Asset_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `Asset_organizationId_name_idx`(`organizationId`, `name`),
    INDEX `Asset_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApartmentAsset` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `apartmentId` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `condition` ENUM('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'BROKEN') NOT NULL DEFAULT 'GOOD',
    `serialNumber` VARCHAR(191) NULL,
    `modelNumber` VARCHAR(191) NULL,
    `purchaseDate` DATETIME(3) NULL,
    `unitValue` DECIMAL(15, 2) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `ApartmentAsset_organizationId_idx`(`organizationId`),
    INDEX `ApartmentAsset_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `ApartmentAsset_apartmentId_idx`(`apartmentId`),
    INDEX `ApartmentAsset_apartmentId_deletedAt_idx`(`apartmentId`, `deletedAt`),
    INDEX `ApartmentAsset_assetId_idx`(`assetId`),
    INDEX `ApartmentAsset_serialNumber_idx`(`serialNumber`),
    INDEX `ApartmentAsset_condition_idx`(`condition`),
    INDEX `ApartmentAsset_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Apartment` ADD COLUMN `assetSetupCompletedAt` DATETIME(3) NULL,
    ADD INDEX `Apartment_organizationId_assetSetupCompletedAt_idx`(`organizationId`, `assetSetupCompletedAt`);

-- AddForeignKey
ALTER TABLE `AssetCategory` ADD CONSTRAINT `AssetCategory_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `AssetCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApartmentAsset` ADD CONSTRAINT `ApartmentAsset_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApartmentAsset` ADD CONSTRAINT `ApartmentAsset_apartmentId_fkey` FOREIGN KEY (`apartmentId`) REFERENCES `Apartment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApartmentAsset` ADD CONSTRAINT `ApartmentAsset_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
