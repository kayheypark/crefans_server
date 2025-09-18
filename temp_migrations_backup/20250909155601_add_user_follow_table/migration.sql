-- CreateTable
CREATE TABLE `user_follows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `follower_id` VARCHAR(191) NOT NULL,
    `following_id` VARCHAR(191) NOT NULL,
    `followed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_follows_follower_id_idx`(`follower_id`),
    INDEX `user_follows_following_id_idx`(`following_id`),
    INDEX `user_follows_followed_at_idx`(`followed_at`),
    INDEX `user_follows_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `user_follows_follower_id_following_id_key`(`follower_id`, `following_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
