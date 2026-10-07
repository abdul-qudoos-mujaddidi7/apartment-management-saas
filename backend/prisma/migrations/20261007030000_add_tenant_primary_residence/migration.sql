-- Add an optional primary residence address without changing the existing address field.
ALTER TABLE `Tenant` ADD COLUMN `primaryResidence` VARCHAR(500) NULL;
