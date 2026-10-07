-- Rename the existing column in place: every old email becomes that user's
-- username verbatim. Password hashes, IDs, organizations and roles are untouched.
ALTER TABLE `User`
  CHANGE COLUMN `email` `username` VARCHAR(191) NOT NULL,
  DROP INDEX `User_email_key`,
  ADD UNIQUE INDEX `User_username_key` (`username`);
