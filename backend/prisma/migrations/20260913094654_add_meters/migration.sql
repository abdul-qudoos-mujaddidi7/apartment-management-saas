-- CreateTable
CREATE TABLE `Meter` (
    `id` VARCHAR(191) NOT NULL,
    `apartmentId` VARCHAR(191) NOT NULL,
    `meterNumber` VARCHAR(191) NOT NULL,
    `utilityType` ENUM('ELECTRICITY', 'WATER', 'GAS') NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `initialReading` DECIMAL(15, 3) NULL,
    `installationDate` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'REPLACED') NOT NULL DEFAULT 'ACTIVE',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Meter_apartmentId_idx`(`apartmentId`),
    INDEX `Meter_apartmentId_deletedAt_idx`(`apartmentId`, `deletedAt`),
    INDEX `Meter_utilityType_idx`(`utilityType`),
    INDEX `Meter_status_idx`(`status`),
    INDEX `Meter_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `Meter_apartmentId_meterNumber_key`(`apartmentId`, `meterNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Meter` ADD CONSTRAINT `Meter_apartmentId_fkey` FOREIGN KEY (`apartmentId`) REFERENCES `Apartment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
