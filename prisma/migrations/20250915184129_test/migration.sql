/*
  Warnings:

  - The primary key for the `comment_likes` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `comments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `creator_categories` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `creators` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `earlybirds` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `membership_items` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `posting_likes` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `posting_medias` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `posting_views` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `postings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `subscriptions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `token_types` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `transfer_reasons` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `transfers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `from_wallet_id` on the `transfers` table. All the data in the column will be lost.
  - You are about to drop the column `to_wallet_id` on the `transfers` table. All the data in the column will be lost.
  - The primary key for the `user_follows` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `wallet_ownerships` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `wallets` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `from_wallet_address` to the `transfers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `to_wallet_address` to the `transfers` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `comment_likes` DROP FOREIGN KEY `comment_likes_comment_id_fkey`;

-- DropForeignKey
ALTER TABLE `comments` DROP FOREIGN KEY `comments_parent_id_fkey`;

-- DropForeignKey
ALTER TABLE `comments` DROP FOREIGN KEY `comments_posting_id_fkey`;

-- DropForeignKey
ALTER TABLE `creators` DROP FOREIGN KEY `creators_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `posting_likes` DROP FOREIGN KEY `posting_likes_posting_id_fkey`;

-- DropForeignKey
ALTER TABLE `posting_medias` DROP FOREIGN KEY `posting_medias_posting_id_fkey`;

-- DropForeignKey
ALTER TABLE `posting_views` DROP FOREIGN KEY `posting_views_posting_id_fkey`;

-- DropForeignKey
ALTER TABLE `subscriptions` DROP FOREIGN KEY `subscriptions_membership_item_id_fkey`;

-- DropForeignKey
ALTER TABLE `transfers` DROP FOREIGN KEY `transfers_from_wallet_id_fkey`;

-- DropForeignKey
ALTER TABLE `transfers` DROP FOREIGN KEY `transfers_subscription_id_fkey`;

-- DropForeignKey
ALTER TABLE `transfers` DROP FOREIGN KEY `transfers_to_wallet_id_fkey`;

-- DropForeignKey
ALTER TABLE `transfers` DROP FOREIGN KEY `transfers_token_type_id_fkey`;

-- DropForeignKey
ALTER TABLE `wallet_ownerships` DROP FOREIGN KEY `wallet_ownerships_wallet_id_fkey`;

-- DropForeignKey
ALTER TABLE `wallets` DROP FOREIGN KEY `wallets_token_type_id_fkey`;

-- DropIndex
DROP INDEX `transfers_from_wallet_id_fkey` ON `transfers`;

-- DropIndex
DROP INDEX `transfers_to_wallet_id_fkey` ON `transfers`;

-- AlterTable
ALTER TABLE `comment_likes` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `comment_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `comments` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `posting_id` VARCHAR(191) NOT NULL,
    MODIFY `parent_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `creator_categories` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `creators` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `category_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `earlybirds` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `membership_items` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `posting_likes` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `posting_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `posting_medias` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `posting_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `posting_views` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `posting_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `postings` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `subscriptions` DROP PRIMARY KEY,
    ADD COLUMN `billing_key` VARCHAR(191) NULL,
    ADD COLUMN `last_payment_date` DATETIME(3) NULL,
    ADD COLUMN `next_billing_date` DATETIME(3) NULL,
    ADD COLUMN `payment_failure_count` INTEGER NOT NULL DEFAULT 0,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `status` ENUM('ONGOING', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'ONGOING',
    MODIFY `membership_item_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `token_types` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `transfer_reasons` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `transfers` DROP PRIMARY KEY,
    DROP COLUMN `from_wallet_id`,
    DROP COLUMN `to_wallet_id`,
    ADD COLUMN `from_wallet_address` VARCHAR(191) NOT NULL,
    ADD COLUMN `to_wallet_address` VARCHAR(191) NOT NULL,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `token_type_id` VARCHAR(191) NOT NULL,
    MODIFY `subscription_id` VARCHAR(191) NULL,
    MODIFY `transfer_reason_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `user_follows` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `wallet_ownerships` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `wallet_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `wallets` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `token_type_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- CreateTable
CREATE TABLE `media_delete_queue` (
    `id` VARCHAR(191) NOT NULL,
    `media_id` VARCHAR(191) NOT NULL,
    `s3_key` VARCHAR(191) NOT NULL,
    `original_url` VARCHAR(191) NOT NULL,
    `queue_reason` ENUM('ORPHANED', 'SOFT_DELETED', 'EXPIRED') NOT NULL,
    `grace_period_end` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    `queued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_delete_queue_media_id_key`(`media_id`),
    INDEX `media_delete_queue_status_idx`(`status`),
    INDEX `media_delete_queue_grace_period_end_idx`(`grace_period_end`),
    INDEX `media_delete_queue_queued_at_idx`(`queued_at`),
    INDEX `media_delete_queue_queue_reason_idx`(`queue_reason`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admins` (
    `id` VARCHAR(191) NOT NULL,
    `user_sub` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'MODERATOR') NOT NULL DEFAULT 'MODERATOR',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,

    UNIQUE INDEX `admins_user_sub_key`(`user_sub`),
    UNIQUE INDEX `admins_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_reports` (
    `id` VARCHAR(191) NOT NULL,
    `reporter_id` VARCHAR(191) NOT NULL,
    `target_type` ENUM('USER', 'POSTING', 'COMMENT') NOT NULL,
    `target_id` VARCHAR(191) NOT NULL,
    `reason` ENUM('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'COPYRIGHT', 'FRAUD', 'OTHER') NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('PENDING', 'REVIEWED', 'RESOLVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `admin_id` VARCHAR(191) NULL,
    `admin_note` TEXT NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_reports_target_type_target_id_idx`(`target_type`, `target_id`),
    INDEX `user_reports_reporter_id_idx`(`reporter_id`),
    INDEX `user_reports_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_suspensions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` ENUM('WARNING', 'TEMPORARY', 'PERMANENT') NOT NULL,
    `reason` TEXT NOT NULL,
    `start_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `end_date` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'LIFTED') NOT NULL DEFAULT 'ACTIVE',
    `admin_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_suspensions_user_id_idx`(`user_id`),
    INDEX `user_suspensions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `payment_key` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 0) NOT NULL,
    `token_amount` DECIMAL(18, 4) NOT NULL,
    `token_type_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'CANCELLED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `method` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `failure_code` VARCHAR(191) NULL,
    `failure_message` VARCHAR(191) NULL,
    `raw_response` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `subscription_id` VARCHAR(191) NULL,
    `billing_key` VARCHAR(191) NULL,
    `is_recurring` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `payment_transactions_order_id_key`(`order_id`),
    UNIQUE INDEX `payment_transactions_payment_key_key`(`payment_key`),
    INDEX `payment_transactions_user_id_idx`(`user_id`),
    INDEX `payment_transactions_status_idx`(`status`),
    INDEX `payment_transactions_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `boards` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `category_id` VARCHAR(191) NOT NULL,
    `is_important` BOOLEAN NOT NULL DEFAULT false,
    `excerpt` TEXT NULL,
    `author` VARCHAR(191) NOT NULL DEFAULT '크리팬스 관리자',
    `views` INTEGER NOT NULL DEFAULT 0,
    `is_published` BOOLEAN NOT NULL DEFAULT true,
    `published_at` DATETIME(3) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `boards_category_id_idx`(`category_id`),
    INDEX `boards_is_published_idx`(`is_published`),
    INDEX `boards_published_at_idx`(`published_at`),
    INDEX `boards_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `board_categories` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `board_categories_code_key`(`code`),
    INDEX `board_categories_sort_order_idx`(`sort_order`),
    INDEX `board_categories_is_public_idx`(`is_public`),
    INDEX `board_categories_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `transfers_from_wallet_address_fkey` ON `transfers`(`from_wallet_address`);

-- CreateIndex
CREATE INDEX `transfers_to_wallet_address_fkey` ON `transfers`(`to_wallet_address`);

-- AddForeignKey
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_token_type_id_fkey` FOREIGN KEY (`token_type_id`) REFERENCES `token_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ownerships` ADD CONSTRAINT `wallet_ownerships_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_from_wallet_address_fkey` FOREIGN KEY (`from_wallet_address`) REFERENCES `wallets`(`address`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_to_wallet_address_fkey` FOREIGN KEY (`to_wallet_address`) REFERENCES `wallets`(`address`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_token_type_id_fkey` FOREIGN KEY (`token_type_id`) REFERENCES `token_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `creators` ADD CONSTRAINT `creators_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `creator_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_membership_item_id_fkey` FOREIGN KEY (`membership_item_id`) REFERENCES `membership_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_views` ADD CONSTRAINT `posting_views_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_medias` ADD CONSTRAINT `posting_medias_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_likes` ADD CONSTRAINT `posting_likes_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comment_likes` ADD CONSTRAINT `comment_likes_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_delete_queue` ADD CONSTRAINT `media_delete_queue_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `medias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_token_type_id_fkey` FOREIGN KEY (`token_type_id`) REFERENCES `token_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `boards` ADD CONSTRAINT `boards_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `board_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
