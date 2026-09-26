-- The contract document, written out in full.
--
-- A contract used to be assembled from a handful of fixed blocks — the two
-- parties, a property table, a money table — with the office's own clauses after
-- them. The document an Afghan lease office actually issues is not built that
-- way: it is a statement of tenancy, a condition of handover, a numbered list of
-- agreed conditions, the signatures, and the notes that qualify the lot. Only
-- the numbered conditions were stored; the rest was the application's wording
-- rather than the office's, which is exactly the part they need to own.
--
-- So `LeaseContractSetting` gains the three texts that make up the document
-- around those conditions — `preamble`, `inventory` and `notes` — and the two
-- headings that introduce them, each in English, Dari and Pashto. They are all
-- nullable and carry `{{placeholder}}` tokens, resolved from the lease being
-- printed the same way a clause's tokens are.
--
-- NULL means "never written", and the service prints the shipped default for it.
-- An empty string means the office deliberately put nothing there, and that
-- section is left out of the document. No existing row is rewritten by this
-- migration, and no existing value is read, so nothing an organization has
-- already saved is lost.
--
-- The same release changes the *shipped* clauses: the ten first-release terms
-- were generic tenancy boilerplate, where the document they are printed into is
-- the office's own legal form. Those ten are retired here — and only for an
-- organization whose entire live clause set is still exactly those ten, so a
-- clause an office has written or edited is never touched. An organization left
-- with no clauses is given the new set by the service on its next read.
--
-- Run once against the production database:
--   mysql --database=<db> < 20260926093000_lease_contract_template_sections/migration.sql
-- (or `npx prisma migrate deploy`, then `npx prisma generate`).

ALTER TABLE `LeaseContractSetting`
  ADD COLUMN `preambleEn`  TEXT NULL,
  ADD COLUMN `preambleFa`  TEXT NULL,
  ADD COLUMN `preamblePs`  TEXT NULL,
  ADD COLUMN `inventoryEn` TEXT NULL,
  ADD COLUMN `inventoryFa` TEXT NULL,
  ADD COLUMN `inventoryPs` TEXT NULL,
  ADD COLUMN `notesEn`     TEXT NULL,
  ADD COLUMN `notesFa`     TEXT NULL,
  ADD COLUMN `notesPs`     TEXT NULL,
  ADD COLUMN `termsTitleEn` VARCHAR(191) NULL,
  ADD COLUMN `termsTitleFa` VARCHAR(191) NULL,
  ADD COLUMN `termsTitlePs` VARCHAR(191) NULL,
  ADD COLUMN `notesTitleEn` VARCHAR(191) NULL,
  ADD COLUMN `notesTitleFa` VARCHAR(191) NULL,
  ADD COLUMN `notesTitlePs` VARCHAR(191) NULL;

-- Retire the first-release clause set. The derived table is required because
-- MySQL will not let a statement read the table it is updating; it lists the
-- organizations whose live clauses are all still stock text, and only those are
-- cleared.
UPDATE `LeaseContractClause`
SET `deletedAt` = CURRENT_TIMESTAMP(3)
WHERE `deletedAt` IS NULL
  AND `titleEn` IN (
    'Rent payment',
    'Security deposit',
    'Utilities and service fees',
    'Maintenance and repairs',
    'Use of the apartment',
    'Subleasing',
    'Termination',
    'Handover of the apartment',
    'Dispute resolution',
    'Signatures'
  )
  AND `organizationId` IN (
    SELECT `organizationId` FROM (
      SELECT `organizationId`
      FROM `LeaseContractClause`
      WHERE `deletedAt` IS NULL
      GROUP BY `organizationId`
      HAVING COUNT(*) = 10
         AND SUM(`titleEn` IN (
               'Rent payment',
               'Security deposit',
               'Utilities and service fees',
               'Maintenance and repairs',
               'Use of the apartment',
               'Subleasing',
               'Termination',
               'Handover of the apartment',
               'Dispute resolution',
               'Signatures'
             )) = 10
    ) AS `stock_clause_organizations`
  );
