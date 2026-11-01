-- Append-only per-creator fee/withdrawal term history.
CREATE TABLE `creator_financial_term_changes` (
 `id` VARCHAR(191) NOT NULL, `member_id` VARCHAR(191) NOT NULL, `version` INTEGER NOT NULL,
 `platform_fee_bps` INTEGER NULL, `settlement_hold_days` INTEGER NULL,
 `bean_withdrawal_fee_bps` INTEGER NULL, `minimum_withdrawal_krw` INTEGER NULL,
 `source` VARCHAR(20) NOT NULL, `changed_by` VARCHAR(191) NULL, `reason` VARCHAR(500) NOT NULL DEFAULT '',
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE INDEX `creator_financial_term_changes_member_id_version_key`(`member_id`,`version`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Terms saved before this table existed get one row with their current values and last change time.
INSERT INTO `creator_financial_term_changes` (`id`,`member_id`,`version`,`platform_fee_bps`,`settlement_hold_days`,`bean_withdrawal_fee_bps`,`minimum_withdrawal_krw`,`source`,`changed_by`,`reason`,`created_at`)
SELECT UUID(),`member_id`,`version`,`platform_fee_bps`,`settlement_hold_days`,`bean_withdrawal_fee_bps`,`minimum_withdrawal_krw`,'backfill',NULL,'이력 기능 이전에 설정된 현재 조건',`updated_at` FROM `creator_financial_terms`;
