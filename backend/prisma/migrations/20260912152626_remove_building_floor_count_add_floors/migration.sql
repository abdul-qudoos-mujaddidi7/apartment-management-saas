-- AlterTable
ALTER TABLE `Building` DROP COLUMN `floorCount`;

-- CreateTable
CREATE TABLE `Floor` (
    `id` VARCHAR(191) NOT NULL,
    `buildingId` VARCHAR(191) NOT NULL,
    `floorNumber` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Floor_buildingId_idx`(`buildingId`),
    INDEX `Floor_deletedAt_idx`(`deletedAt`),
    INDEX `Floor_buildingId_deletedAt_idx`(`buildingId`, `deletedAt`),
    UNIQUE INDEX `Floor_buildingId_floorNumber_key`(`buildingId`, `floorNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Floor` ADD CONSTRAINT `Floor_buildingId_fkey` FOREIGN KEY (`buildingId`) REFERENCES `Building`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
