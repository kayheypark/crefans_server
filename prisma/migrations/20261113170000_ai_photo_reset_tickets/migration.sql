-- Storable AI photo reset tickets (2026-11-13 user request). New tables only; no existing data changes.
CREATE TABLE `ai_photo_reset_tickets` (
    `id` VARCHAR(191) NOT NULL,
    `creator_user_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `remaining` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `granted_by` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_by` VARCHAR(191) NULL,
    `revoke_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_photo_reset_tickets_creator_user_id_expires_at_idx`(`creator_user_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_photo_reset_ticket_uses` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `creator_user_id` VARCHAR(191) NOT NULL,
    `used_before` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_photo_reset_ticket_uses_ticket_id_idx`(`ticket_id`),
    INDEX `ai_photo_reset_ticket_uses_creator_user_id_created_at_idx`(`creator_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
