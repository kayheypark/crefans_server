-- CreateTable
CREATE TABLE `earlybirds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_sub` VARCHAR(191) NOT NULL,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rewarded` BOOLEAN NOT NULL DEFAULT false,
    `rewarded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `earlybirds_user_sub_key`(`user_sub`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
