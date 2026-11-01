ALTER TABLE `revenue_entries`
 ADD COLUMN `receipt_confirmed_at` DATETIME(3) NULL,
 ADD COLUMN `receipt_reference` VARCHAR(191) NULL,
 ADD COLUMN `received_amount` INTEGER NULL;
CREATE TABLE `marketing_deliveries` (
 `id` VARCHAR(191) NOT NULL,
 `member_id` VARCHAR(191) NOT NULL,
 `kind` VARCHAR(40) NOT NULL,
 `dedupe_key` VARCHAR(191) NOT NULL,
 `consent_id` VARCHAR(191) NULL,
 `subject` VARCHAR(200) NOT NULL,
 `body` TEXT NOT NULL,
 `status` VARCHAR(30) NOT NULL DEFAULT 'queued',
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `completed_at` DATETIME(3) NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `marketing_deliveries_dedupe_key_key` (`dedupe_key`),
 INDEX `marketing_deliveries_status_created_at_idx` (`status`,`created_at`),
 INDEX `marketing_deliveries_member_id_kind_completed_at_idx` (`member_id`,`kind`,`completed_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `account_preferences` ADD COLUMN `marketing_consent_id` VARCHAR(191) NULL;
