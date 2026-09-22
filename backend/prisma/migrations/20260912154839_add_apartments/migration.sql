-- CreateTable
CREATE TABLE `Apartment` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NOT NULL,
    `apartmentNumber` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_BEDROOM', 'FOUR_BEDROOM_PLUS', 'DUPLEX', 'PENTHOUSE', 'OFFICE', 'SHOP') NOT NULL,
    `area` DECIMAL(10, 2) NULL,
    `bedrooms` INTEGER NOT NULL DEFAULT 0,
    `bathrooms` INTEGER NOT NULL DEFAULT 0,
    `monthlyRent` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` ENUM('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Apartment_organizationId_idx`(`organizationId`),
    INDEX `Apartment_floorId_idx`(`floorId`),
    INDEX `Apartment_deletedAt_idx`(`deletedAt`),
    INDEX `Apartment_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `Apartment_floorId_deletedAt_idx`(`floorId`, `deletedAt`),
    UNIQUE INDEX `Apartment_floorId_apartmentNumber_key`(`floorId`, `apartmentNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Apartment` ADD CONSTRAINT `Apartment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Apartment` ADD CONSTRAINT `Apartment_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
