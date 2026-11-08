-- Studio AI photo editor allow-list (2026-11-08). New tables only; no existing data changes.
CREATE TABLE `ai_photo_grants` (
    `creator_user_id` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `granted_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_photo_grants_created_at_idx`(`created_at`),
    PRIMARY KEY (`creator_user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_photo_grant_changes` (
    `id` VARCHAR(191) NOT NULL,
    `creator_user_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `changed_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_photo_grant_changes_creator_user_id_created_at_idx`(`creator_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
