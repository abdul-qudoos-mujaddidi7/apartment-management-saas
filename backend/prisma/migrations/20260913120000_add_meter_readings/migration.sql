-- CreateTable
CREATE TABLE `MeterReading` (
    `id` VARCHAR(191) NOT NULL,
    `meterId` VARCHAR(191) NOT NULL,
    `readingDate` DATETIME(3) NOT NULL,
    `previousReading` DECIMAL(15, 3) NOT NULL,
    `currentReading` DECIMAL(15, 3) NOT NULL,
    `consumption` DECIMAL(15, 3) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    UNIQUE INDEX `MeterReading_meterId_readingDate_key`(`meterId`, `readingDate`),
    INDEX `MeterReading_meterId_idx`(`meterId`),
    INDEX `MeterReading_readingDate_idx`(`readingDate`),
    INDEX `MeterReading_deletedAt_idx`(`deletedAt`),
    INDEX `MeterReading_meterId_readingDate_idx`(`meterId`, `readingDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MeterReading` ADD CONSTRAINT `MeterReading_meterId_fkey`
  FOREIGN KEY (`meterId`) REFERENCES `Meter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
