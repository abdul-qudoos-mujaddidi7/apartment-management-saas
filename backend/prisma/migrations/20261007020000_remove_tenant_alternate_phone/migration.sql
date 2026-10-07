-- Remove the tenant alternate phone field. Other tenant and guarantor data is preserved.
ALTER TABLE `Tenant` DROP COLUMN `alternatePhone`;
