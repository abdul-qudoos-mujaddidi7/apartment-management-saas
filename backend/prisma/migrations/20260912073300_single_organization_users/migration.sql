-- Add direct organization and role ownership to users before retiring the membership table.
ALTER TABLE `User`
    ADD COLUMN `organizationId` VARCHAR(191) NULL,
    ADD COLUMN `roleId` VARCHAR(191) NULL;

UPDATE `User` AS `user`
INNER JOIN `OrganizationUser` AS `membership` ON `membership`.`userId` = `user`.`id`
SET
    `user`.`organizationId` = `membership`.`organizationId`,
    `user`.`roleId` = `membership`.`roleId`
WHERE `membership`.`deletedAt` IS NULL;

ALTER TABLE `User`
    MODIFY `organizationId` VARCHAR(191) NOT NULL,
    MODIFY `roleId` VARCHAR(191) NOT NULL,
    ADD INDEX `User_organizationId_idx`(`organizationId`),
    ADD INDEX `User_roleId_idx`(`roleId`),
    ADD CONSTRAINT `User_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrganizationUser` DROP FOREIGN KEY `OrganizationUser_organizationId_fkey`;
ALTER TABLE `OrganizationUser` DROP FOREIGN KEY `OrganizationUser_userId_fkey`;
ALTER TABLE `OrganizationUser` DROP FOREIGN KEY `OrganizationUser_roleId_fkey`;
DROP TABLE `OrganizationUser`;
