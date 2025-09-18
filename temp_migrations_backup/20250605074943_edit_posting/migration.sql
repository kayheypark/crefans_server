/*
  Warnings:

  - The values [COMPLETED] on the enum `wallet_creation_queues_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `wallet_creation_queues` MODIFY `status` ENUM('PENDING', 'PROCESSING', 'CANCELLED', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE `medias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('IMAGE', 'VIDEO', 'AUDIO') NOT NULL,
    `original_name` VARCHAR(191) NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `file_path` VARCHAR(191) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `thumbnail_path` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `posting_views` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `posting_id` INTEGER NOT NULL,
    `viewer_id` VARCHAR(191) NULL,
    `viewer_ip` VARCHAR(191) NULL,
    `viewer_ua` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `posting_views_posting_id_viewer_id_viewer_ip_key`(`posting_id`, `viewer_id`, `viewer_ip`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `postings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `creator_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `is_membership` BOOLEAN NOT NULL DEFAULT false,
    `membership_level` INTEGER NULL,
    `publish_start_at` DATETIME(3) NULL,
    `publish_end_at` DATETIME(3) NULL,
    `total_view_count` INTEGER NOT NULL DEFAULT 0,
    `unique_view_count` INTEGER NOT NULL DEFAULT 0,
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `comment_count` INTEGER NOT NULL DEFAULT 0,
    `published_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `posting_medias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `posting_id` INTEGER NOT NULL,
    `media_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_free_preview` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `posting_medias_posting_id_media_id_key`(`posting_id`, `media_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `posting_id` INTEGER NOT NULL,
    `author_id` VARCHAR(191) NOT NULL,
    `tagged_user_id` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `parent_id` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `posting_likes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `posting_id` INTEGER NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `posting_likes_posting_id_user_id_key`(`posting_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `posting_views` ADD CONSTRAINT `posting_views_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_medias` ADD CONSTRAINT `posting_medias_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_medias` ADD CONSTRAINT `posting_medias_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `medias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_likes` ADD CONSTRAINT `posting_likes_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
