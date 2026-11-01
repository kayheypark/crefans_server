-- Console-managed service settings (2026-11-01). The friend invite switch moves here from the REFERRAL_ENABLED env var; default off.
CREATE TABLE `platform_settings` (
    `key` VARCHAR(64) NOT NULL,
    `value` JSON NOT NULL,
    `updated_by` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
