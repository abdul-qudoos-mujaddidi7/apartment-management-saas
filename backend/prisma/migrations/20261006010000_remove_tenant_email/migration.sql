-- Remove the tenant email field as requested. Other tenant data is preserved.
ALTER TABLE `Tenant` DROP COLUMN `email`;
