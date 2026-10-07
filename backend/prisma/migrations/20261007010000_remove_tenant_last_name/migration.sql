-- Remove the tenant surname field. Tenant IDs and related records are unchanged.
ALTER TABLE `Tenant` DROP COLUMN `lastName`;
