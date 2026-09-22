-- Init: the complete schema, created from scratch.
--
-- Every table is created complete in one statement: its columns, its indexes and
-- its foreign keys. Tables are ordered so each one's parents already exist, which
-- is why this file contains nothing but CREATE TABLE statements.
--
-- Generated from prisma/schema.prisma (28 tables, 45 foreign keys).
-- This migration replaces the 20 incremental migrations that preceded it.

-- CreateTable
CREATE TABLE `Organization` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `baseCurrency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Organization_slug_key`(`slug`),
    INDEX `Organization_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Currency` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(3) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `symbol` VARCHAR(8) NULL,
    `isBase` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Currency_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `Currency_organizationId_isActive_idx`(`organizationId`, `isActive`),
    UNIQUE INDEX `Currency_organizationId_code_key`(`organizationId`, `code`),
    CONSTRAINT `Currency_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExchangeRate` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `currencyId` VARCHAR(191) NOT NULL,
    `rate` DECIMAL(18, 8) NOT NULL,
    `effectiveDate` DATE NOT NULL,
    `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExchangeRate_organizationId_effectiveDate_idx`(`organizationId`, `effectiveDate`),
    INDEX `ExchangeRate_currencyId_effectiveDate_idx`(`currencyId`, `effectiveDate`),
    UNIQUE INDEX `ExchangeRate_currencyId_effectiveDate_key`(`currencyId`, `effectiveDate`),
    CONSTRAINT `ExchangeRate_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ExchangeRate_currencyId_fkey` FOREIGN KEY (`currencyId`)
        REFERENCES `Currency`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Role_name_key`(`name`),
    INDEX `Role_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_organizationId_idx`(`organizationId`),
    INDEX `User_roleId_idx`(`roleId`),
    INDEX `User_deletedAt_idx`(`deletedAt`),
    CONSTRAINT `User_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`)
        REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Building` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Building_organizationId_idx`(`organizationId`),
    INDEX `Building_deletedAt_idx`(`deletedAt`),
    INDEX `Building_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    UNIQUE INDEX `Building_organizationId_code_key`(`organizationId`, `code`),
    CONSTRAINT `Building_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Floor` (
    `id` VARCHAR(191) NOT NULL,
    `buildingId` VARCHAR(191) NOT NULL,
    `floorNumber` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Floor_buildingId_idx`(`buildingId`),
    INDEX `Floor_deletedAt_idx`(`deletedAt`),
    INDEX `Floor_buildingId_deletedAt_idx`(`buildingId`, `deletedAt`),
    UNIQUE INDEX `Floor_buildingId_floorNumber_key`(`buildingId`, `floorNumber`),
    CONSTRAINT `Floor_buildingId_fkey` FOREIGN KEY (`buildingId`)
        REFERENCES `Building`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Apartment` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NOT NULL,
    `apartmentNumber` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('RESIDENTIAL', 'COMMERCIAL', 'OFFICE', 'OTHER') NOT NULL,
    `area` DECIMAL(10, 2) NULL,
    `bedrooms` INTEGER NOT NULL DEFAULT 0,
    `bathrooms` INTEGER NOT NULL DEFAULT 0,
    `monthlyRent` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` ENUM('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
    `assetSetupCompletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Apartment_organizationId_idx`(`organizationId`),
    INDEX `Apartment_floorId_idx`(`floorId`),
    INDEX `Apartment_deletedAt_idx`(`deletedAt`),
    INDEX `Apartment_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `Apartment_floorId_deletedAt_idx`(`floorId`, `deletedAt`),
    INDEX `Apartment_organizationId_assetSetupCompletedAt_idx`(`organizationId`, `assetSetupCompletedAt`),
    UNIQUE INDEX `Apartment_floorId_apartmentNumber_key`(`floorId`, `apartmentNumber`),
    CONSTRAINT `Apartment_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Apartment_floorId_fkey` FOREIGN KEY (`floorId`)
        REFERENCES `Floor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApartmentSpace` (
    `id` VARCHAR(191) NOT NULL,
    `apartmentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `ApartmentSpace_apartmentId_idx`(`apartmentId`),
    INDEX `ApartmentSpace_deletedAt_idx`(`deletedAt`),
    INDEX `ApartmentSpace_apartmentId_deletedAt_idx`(`apartmentId`, `deletedAt`),
    CONSTRAINT `ApartmentSpace_apartmentId_fkey` FOREIGN KEY (`apartmentId`)
        REFERENCES `Apartment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Meter` (
    `id` VARCHAR(191) NOT NULL,
    `apartmentId` VARCHAR(191) NOT NULL,
    `meterNumber` VARCHAR(191) NOT NULL,
    `utilityType` ENUM('ELECTRICITY', 'WATER', 'GAS') NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `defaultUnitPrice` DECIMAL(15, 4) NOT NULL DEFAULT 0,
    `initialReading` DECIMAL(15, 3) NULL,
    `installationDate` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'REPLACED') NOT NULL DEFAULT 'ACTIVE',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Meter_apartmentId_idx`(`apartmentId`),
    INDEX `Meter_apartmentId_deletedAt_idx`(`apartmentId`, `deletedAt`),
    INDEX `Meter_utilityType_idx`(`utilityType`),
    INDEX `Meter_status_idx`(`status`),
    INDEX `Meter_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `Meter_apartmentId_meterNumber_key`(`apartmentId`, `meterNumber`),
    CONSTRAINT `Meter_apartmentId_fkey` FOREIGN KEY (`apartmentId`)
        REFERENCES `Apartment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeterReading` (
    `id` VARCHAR(191) NOT NULL,
    `meterId` VARCHAR(191) NOT NULL,
    `readingDate` DATETIME(3) NOT NULL,
    `previousReading` DECIMAL(15, 3) NOT NULL,
    `currentReading` DECIMAL(15, 3) NOT NULL,
    `consumption` DECIMAL(15, 3) NOT NULL,
    `unitPrice` DECIMAL(15, 4) NOT NULL DEFAULT 0,
    `amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `MeterReading_meterId_idx`(`meterId`),
    INDEX `MeterReading_readingDate_idx`(`readingDate`),
    INDEX `MeterReading_deletedAt_idx`(`deletedAt`),
    INDEX `MeterReading_meterId_readingDate_idx`(`meterId`, `readingDate`),
    UNIQUE INDEX `MeterReading_meterId_readingDate_key`(`meterId`, `readingDate`),
    CONSTRAINT `MeterReading_meterId_fkey` FOREIGN KEY (`meterId`)
        REFERENCES `Meter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `alternatePhone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `nationalId` VARCHAR(191) NULL,
    `address` VARCHAR(500) NULL,
    `emergencyContactName` VARCHAR(191) NULL,
    `emergencyContactPhone` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Tenant_organizationId_idx`(`organizationId`),
    INDEX `Tenant_deletedAt_idx`(`deletedAt`),
    INDEX `Tenant_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    CONSTRAINT `Tenant_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lease` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `apartmentId` VARCHAR(191) NOT NULL,
    `contractNumber` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `monthlyRent` DECIMAL(12, 2) NOT NULL,
    `securityDeposit` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
    `paymentDueDay` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED') NOT NULL DEFAULT 'DRAFT',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Lease_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `Lease_tenantId_deletedAt_idx`(`tenantId`, `deletedAt`),
    INDEX `Lease_apartmentId_deletedAt_idx`(`apartmentId`, `deletedAt`),
    UNIQUE INDEX `Lease_organizationId_contractNumber_key`(`organizationId`, `contractNumber`),
    CONSTRAINT `Lease_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Lease_tenantId_fkey` FOREIGN KEY (`tenantId`)
        REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Lease_apartmentId_fkey` FOREIGN KEY (`apartmentId`)
        REFERENCES `Apartment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `leaseId` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `invoiceDate` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
    `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `subtotal` DECIMAL(15, 2) NOT NULL,
    `total` DECIMAL(15, 2) NOT NULL,
    `paidAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `baseSubtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `baseTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `basePaidAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `status` ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'UNPAID',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Invoice_organizationId_idx`(`organizationId`),
    INDEX `Invoice_leaseId_idx`(`leaseId`),
    INDEX `Invoice_status_idx`(`status`),
    INDEX `Invoice_invoiceDate_idx`(`invoiceDate`),
    INDEX `Invoice_deletedAt_idx`(`deletedAt`),
    INDEX `Invoice_organizationId_currency_idx`(`organizationId`, `currency`),
    UNIQUE INDEX `Invoice_organizationId_invoiceNumber_key`(`organizationId`, `invoiceNumber`),
    CONSTRAINT `Invoice_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Invoice_leaseId_fkey` FOREIGN KEY (`leaseId`)
        REFERENCES `Lease`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialAccount` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE') NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `FinancialAccount_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    UNIQUE INDEX `FinancialAccount_organizationId_code_key`(`organizationId`, `code`),
    CONSTRAINT `FinancialAccount_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Journal` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `journalNumber` VARCHAR(191) NOT NULL,
    `transactionDate` DATETIME(3) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
    `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `referenceType` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('POSTED', 'VOIDED') NOT NULL DEFAULT 'POSTED',
    `voidedAt` DATETIME(3) NULL,
    `voidReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Journal_organizationId_transactionDate_idx`(`organizationId`, `transactionDate`),
    UNIQUE INDEX `Journal_organizationId_journalNumber_key`(`organizationId`, `journalNumber`),
    UNIQUE INDEX `Journal_organizationId_referenceType_referenceId_key`(`organizationId`, `referenceType`, `referenceId`),
    CONSTRAINT `Journal_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantAccount` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `balance` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TenantAccount_organizationId_balance_idx`(`organizationId`, `balance`),
    UNIQUE INDEX `TenantAccount_organizationId_tenantId_key`(`organizationId`, `tenantId`),
    CONSTRAINT `TenantAccount_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `TenantAccount_tenantId_fkey` FOREIGN KEY (`tenantId`)
        REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantLedgerEntry` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `tenantAccountId` VARCHAR(191) NOT NULL,
    `type` ENUM('INVOICE', 'PAYMENT', 'DEBIT_ADJUSTMENT', 'CREDIT_ADJUSTMENT', 'REVERSAL') NOT NULL,
    `transactionDate` DATETIME(3) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
    `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `referenceType` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `debit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `balanceAfter` DECIMAL(15, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TenantLedgerEntry_organizationId_idx`(`organizationId`),
    INDEX `TenantLedgerEntry_tenantAccountId_transactionDate_idx`(`tenantAccountId`, `transactionDate`),
    INDEX `TenantLedgerEntry_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
    UNIQUE INDEX `tenant_ledger_ref_type_uq`(`organizationId`, `referenceType`, `referenceId`, `type`),
    CONSTRAINT `TenantLedgerEntry_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `TenantLedgerEntry_tenantAccountId_fkey` FOREIGN KEY (`tenantAccountId`)
        REFERENCES `TenantAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalLine` (
    `id` VARCHAR(191) NOT NULL,
    `journalId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `debit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `baseDebit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `baseCredit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `JournalLine_journalId_idx`(`journalId`),
    INDEX `JournalLine_accountId_idx`(`accountId`),
    INDEX `JournalLine_tenantId_idx`(`tenantId`),
    CONSTRAINT `JournalLine_journalId_fkey` FOREIGN KEY (`journalId`)
        REFERENCES `Journal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `JournalLine_accountId_fkey` FOREIGN KEY (`accountId`)
        REFERENCES `FinancialAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `JournalLine_tenantId_fkey` FOREIGN KEY (`tenantId`)
        REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `leaseId` VARCHAR(191) NULL,
    `paymentNumber` VARCHAR(191) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
    `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `amount` DECIMAL(15, 2) NOT NULL,
    `baseAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `receiveAccountId` VARCHAR(191) NOT NULL,
    `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_MONEY', 'OTHER') NOT NULL,
    `reference` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `status` ENUM('POSTED', 'VOIDED') NOT NULL DEFAULT 'POSTED',
    `voidedAt` DATETIME(3) NULL,
    `voidReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Payment_organizationId_paymentDate_idx`(`organizationId`, `paymentDate`),
    INDEX `Payment_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `Payment_leaseId_idx`(`leaseId`),
    UNIQUE INDEX `Payment_organizationId_paymentNumber_key`(`organizationId`, `paymentNumber`),
    CONSTRAINT `Payment_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Payment_tenantId_fkey` FOREIGN KEY (`tenantId`)
        REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Payment_leaseId_fkey` FOREIGN KEY (`leaseId`)
        REFERENCES `Lease`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Payment_receiveAccountId_fkey` FOREIGN KEY (`receiveAccountId`)
        REFERENCES `FinancialAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceItem` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `meterReadingId` VARCHAR(191) NULL,
    `type` ENUM('RENT', 'ELECTRICITY', 'WATER', 'GAS', 'OTHER') NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(15, 4) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InvoiceItem_meterReadingId_key`(`meterReadingId`),
    INDEX `InvoiceItem_invoiceId_idx`(`invoiceId`),
    CONSTRAINT `InvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`)
        REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `InvoiceItem_meterReadingId_fkey` FOREIGN KEY (`meterReadingId`)
        REFERENCES `MeterReading`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `invoiceItemId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `appliedAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `baseAppliedAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `voidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentAllocation_invoiceItemId_voidedAt_idx`(`invoiceItemId`, `voidedAt`),
    UNIQUE INDEX `PaymentAllocation_paymentId_invoiceItemId_key`(`paymentId`, `invoiceItemId`),
    CONSTRAINT `PaymentAllocation_paymentId_fkey` FOREIGN KEY (`paymentId`)
        REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `PaymentAllocation_invoiceItemId_fkey` FOREIGN KEY (`invoiceItemId`)
        REFERENCES `InvoiceItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecurityDepositTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `leaseId` VARCHAR(191) NOT NULL,
    `type` ENUM('RECEIVED', 'DEDUCTION', 'REFUND') NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'AFN',
    `exchangeRate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `amount` DECIMAL(15, 2) NOT NULL,
    `baseAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `transactionDate` DATETIME(3) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `status` ENUM('POSTED', 'VOIDED') NOT NULL DEFAULT 'POSTED',
    `voidReason` TEXT NULL,
    `voidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SecurityDepositTransaction_organizationId_idx`(`organizationId`),
    INDEX `SecurityDepositTransaction_leaseId_idx`(`leaseId`),
    INDEX `SecurityDepositTransaction_organizationId_leaseId_idx`(`organizationId`, `leaseId`),
    INDEX `SecurityDepositTransaction_type_idx`(`type`),
    INDEX `SecurityDepositTransaction_status_idx`(`status`),
    INDEX `SecurityDepositTransaction_transactionDate_idx`(`transactionDate`),
    CONSTRAINT `SecurityDepositTransaction_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `SecurityDepositTransaction_leaseId_fkey` FOREIGN KEY (`leaseId`)
        REFERENCES `Lease`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetCategory` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `AssetCategory_organizationId_idx`(`organizationId`),
    INDEX `AssetCategory_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `AssetCategory_organizationId_name_idx`(`organizationId`, `name`),
    INDEX `AssetCategory_deletedAt_idx`(`deletedAt`),
    CONSTRAINT `AssetCategory_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `unit` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Asset_organizationId_idx`(`organizationId`),
    INDEX `Asset_categoryId_idx`(`categoryId`),
    INDEX `Asset_name_idx`(`name`),
    INDEX `Asset_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `Asset_organizationId_name_idx`(`organizationId`, `name`),
    INDEX `Asset_deletedAt_idx`(`deletedAt`),
    CONSTRAINT `Asset_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Asset_categoryId_fkey` FOREIGN KEY (`categoryId`)
        REFERENCES `AssetCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApartmentAsset` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `apartmentId` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `condition` ENUM('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'BROKEN') NOT NULL DEFAULT 'GOOD',
    `serialNumber` VARCHAR(191) NULL,
    `modelNumber` VARCHAR(191) NULL,
    `purchaseDate` DATETIME(3) NULL,
    `unitValue` DECIMAL(15, 2) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `ApartmentAsset_organizationId_idx`(`organizationId`),
    INDEX `ApartmentAsset_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `ApartmentAsset_apartmentId_idx`(`apartmentId`),
    INDEX `ApartmentAsset_apartmentId_deletedAt_idx`(`apartmentId`, `deletedAt`),
    INDEX `ApartmentAsset_assetId_idx`(`assetId`),
    INDEX `ApartmentAsset_serialNumber_idx`(`serialNumber`),
    INDEX `ApartmentAsset_condition_idx`(`condition`),
    INDEX `ApartmentAsset_deletedAt_idx`(`deletedAt`),
    CONSTRAINT `ApartmentAsset_organizationId_fkey` FOREIGN KEY (`organizationId`)
        REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ApartmentAsset_apartmentId_fkey` FOREIGN KEY (`apartmentId`)
        REFERENCES `Apartment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ApartmentAsset_assetId_fkey` FOREIGN KEY (`assetId`)
        REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Permission_code_key`(`code`),
    INDEX `Permission_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `id` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `RolePermission_permissionId_idx`(`permissionId`),
    INDEX `RolePermission_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `RolePermission_roleId_permissionId_key`(`roleId`, `permissionId`),
    CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`)
        REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`)
        REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
