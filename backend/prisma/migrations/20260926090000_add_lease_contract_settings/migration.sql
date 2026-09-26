-- The lease contract (قرارداد کرایه‌نامه) is generated from records that already
-- exist — the tenant, the apartment, the building and the lease itself. Only the
-- two things with no other home are stored here:
--
--   * `LeaseContractSetting` — one row per organization: who issues the
--     contract, the office header, the lessor's own details, the document's
--     title in each language, the numbering prefix, the signature labels and the
--     two "print this photograph" switches.
--   * `LeaseContractClause` — the numbered terms, each written in English, Dari
--     and Pashto, reorderable and individually switchable, with the
--     {{placeholder}} tokens resolved from this lease's own records when the
--     contract is built.
--
-- Both tables are additive: nothing already stored is read, changed or removed,
-- and both key back to `Organization`, which is where every query's
-- organization scoping starts.
--
-- Run once against the production database:
--   mysql --database=<db> < 20260926090000_add_lease_contract_settings/migration.sql
-- (or `npx prisma migrate deploy`, then `npx prisma generate`).

CREATE TABLE `LeaseContractSetting` (
  `id`             VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,

  -- The office that issues the contract. This address is deliberately separate
  -- from the building's: the rented property's address is read from `Building`.
  `officeName`     VARCHAR(191) NULL,
  `officeAddress`  TEXT NULL,
  `officePhone`    VARCHAR(64) NULL,
  `officeEmail`    VARCHAR(191) NULL,
  `licenseNumber`  VARCHAR(191) NULL,
  `logoUrl`        VARCHAR(500) NULL,

  -- "en" | "fa" | "ps" — the same codes the frontend's locale store uses.
  `defaultLanguage` VARCHAR(5) NOT NULL DEFAULT 'fa',

  `titleEn` VARCHAR(191) NOT NULL DEFAULT 'Lease Agreement',
  `titleFa` VARCHAR(191) NOT NULL DEFAULT 'قرارداد کرایه‌نامه',
  `titlePs` VARCHAR(191) NOT NULL DEFAULT 'د کرایې تړون',

  `lessorName`       VARCHAR(191) NULL,
  `lessorPhone`      VARCHAR(64) NULL,
  `lessorNationalId` VARCHAR(64) NULL,
  `lessorAddress`    TEXT NULL,
  `lessorPhotoUrl`   VARCHAR(500) NULL,

  `contractNumberPrefix` VARCHAR(32) NULL,
  `footerText`           TEXT NULL,

  `lessorSignatureLabel`  VARCHAR(191) NULL,
  `tenantSignatureLabel`  VARCHAR(191) NULL,
  `witnessSignatureLabel` VARCHAR(191) NULL,

  -- A contract is complete without photographs; these only decide whether the
  -- optional slots are drawn at all.
  `showTenantPhoto` BOOLEAN NOT NULL DEFAULT true,
  `showLessorPhoto` BOOLEAN NOT NULL DEFAULT false,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `LeaseContractSetting_organizationId_key` (`organizationId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LeaseContractClause` (
  `id`             VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,

  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isEnabled` BOOLEAN NOT NULL DEFAULT true,

  `titleEn` VARCHAR(191) NOT NULL DEFAULT '',
  `titleFa` VARCHAR(191) NOT NULL DEFAULT '',
  `titlePs` VARCHAR(191) NOT NULL DEFAULT '',

  -- English is required: it is the language a blank translation falls back to,
  -- so a clause can never render as nothing.
  `bodyEn` TEXT NOT NULL,
  `bodyFa` TEXT NULL,
  `bodyPs` TEXT NULL,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,

  INDEX `LeaseContractClause_organizationId_deletedAt_idx` (`organizationId`, `deletedAt`),
  INDEX `LeaseContractClause_organizationId_sortOrder_idx` (`organizationId`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LeaseContractSetting`
  ADD CONSTRAINT `LeaseContractSetting_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LeaseContractClause`
  ADD CONSTRAINT `LeaseContractClause_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
