-- AlterTable
ALTER TABLE `identity_proofs` ADD COLUMN `verified_name` VARCHAR(80) NULL;

-- AlterTable
ALTER TABLE `member_consents` ADD COLUMN `document_snapshot` JSON NULL;

-- CreateTable
CREATE TABLE `follow_events` (
    `id` VARCHAR(191) NOT NULL,
    `follower_id` VARCHAR(191) NOT NULL,
    `following_id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `follow_events_following_id_created_at_idx`(`following_id`, `created_at`),
    INDEX `follow_events_follower_id_following_id_idx`(`follower_id`, `following_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

