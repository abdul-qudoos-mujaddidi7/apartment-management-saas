-- Payment receipts are identified by their receiving account.
ALTER TABLE `Payment` DROP COLUMN `paymentMethod`;
