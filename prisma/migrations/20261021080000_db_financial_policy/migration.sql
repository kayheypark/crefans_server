CREATE TABLE `financial_policies` (
 `id` VARCHAR(32) NOT NULL DEFAULT 'platform',
 `version` INTEGER NOT NULL DEFAULT 0,
 `platform_fee_bps` INTEGER NULL,
 `settlement_hold_days` INTEGER NULL,
 `updated_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `financial_policy_changes` (
 `id` VARCHAR(191) NOT NULL,
 `version` INTEGER NOT NULL,
 `platform_fee_bps` INTEGER NOT NULL,
 `settlement_hold_days` INTEGER NOT NULL,
 `changed_by` VARCHAR(191) NULL,
 `reason` VARCHAR(500) NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE INDEX `financial_policy_changes_version_key` (`version`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `financial_policies` (`id`,`version`,`updated_at`) VALUES ('platform',0,CURRENT_TIMESTAMP(3));
