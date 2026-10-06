-- Remove categories while keeping all assets and apartment inventory records.
ALTER TABLE `Asset` DROP FOREIGN KEY `Asset_categoryId_fkey`;
DROP INDEX `Asset_categoryId_idx` ON `Asset`;
ALTER TABLE `Asset` DROP COLUMN `categoryId`;
DROP TABLE `AssetCategory`;
DELETE FROM `RolePermission` WHERE `permissionId` IN (SELECT `id` FROM `Permission` WHERE `code` IN ('ASSET_CATEGORY_VIEW', 'ASSET_CATEGORY_CREATE', 'ASSET_CATEGORY_UPDATE', 'ASSET_CATEGORY_DELETE'));
DELETE FROM `Permission` WHERE `code` IN ('ASSET_CATEGORY_VIEW', 'ASSET_CATEGORY_CREATE', 'ASSET_CATEGORY_UPDATE', 'ASSET_CATEGORY_DELETE');
