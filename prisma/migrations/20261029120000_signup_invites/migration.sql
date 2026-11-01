-- Admin-managed beta invitations and per-creator fee/withdrawal overrides.
CREATE TABLE `signup_invites` (
 `id` VARCHAR(191) NOT NULL, `email` VARCHAR(191) NOT NULL, `memo` VARCHAR(100) NOT NULL DEFAULT '',
 `platform_fee_bps` INTEGER NULL, `settlement_hold_days` INTEGER NULL,
 `bean_withdrawal_fee_bps` INTEGER NULL, `minimum_withdrawal_krw` INTEGER NULL,
 `member_id` VARCHAR(191) NULL, `used_at` DATETIME(3) NULL, `revoked_at` DATETIME(3) NULL,
 `version` INTEGER NOT NULL DEFAULT 1, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updated_at` DATETIME(3) NOT NULL,
 UNIQUE INDEX `signup_invites_email_key`(`email`),
 INDEX `signup_invites_revoked_at_created_at_idx`(`revoked_at`,`created_at`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `creator_financial_terms` (
 `member_id` VARCHAR(191) NOT NULL,
 `platform_fee_bps` INTEGER NULL, `settlement_hold_days` INTEGER NULL,
 `bean_withdrawal_fee_bps` INTEGER NULL, `minimum_withdrawal_krw` INTEGER NULL,
 `version` INTEGER NOT NULL DEFAULT 1, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updated_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
