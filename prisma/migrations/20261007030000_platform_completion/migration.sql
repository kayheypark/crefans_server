-- AlterTable
ALTER TABLE `checkout_orders` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `retry_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `member_consents` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `accepted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_consents_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

