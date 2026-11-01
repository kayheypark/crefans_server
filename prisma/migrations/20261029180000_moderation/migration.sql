-- Operator moderation: hide posts, suspend members, keep an action history.
ALTER TABLE `postings` ADD COLUMN `hidden_at` DATETIME(3) NULL,
    ADD COLUMN `hidden_reason` VARCHAR(500) NULL,
    ADD COLUMN `hidden_by` VARCHAR(191) NULL;

ALTER TABLE `members` ADD COLUMN `suspended_at` DATETIME(3) NULL,
    ADD COLUMN `suspended_until` DATETIME(3) NULL,
    ADD COLUMN `suspension_reason` VARCHAR(500) NULL;

CREATE TABLE `moderation_actions` (
 `id` VARCHAR(191) NOT NULL, `target_type` VARCHAR(20) NOT NULL, `target_id` VARCHAR(191) NOT NULL,
 `action` VARCHAR(30) NOT NULL, `reason` VARCHAR(500) NOT NULL, `until` DATETIME(3) NULL,
 `admin_id` VARCHAR(191) NOT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX `moderation_actions_target_type_target_id_created_at_idx`(`target_type`,`target_id`,`created_at`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
