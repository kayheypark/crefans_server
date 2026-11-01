-- CreateTable
CREATE TABLE `members` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `cognito_username` VARCHAR(191) NULL,
    `password_hash` VARCHAR(255) NULL,
    `name` VARCHAR(255) NOT NULL,
    `nickname` VARCHAR(191) NOT NULL,
    `preferred_username` VARCHAR(191) NOT NULL,
    `phone_number` VARCHAR(64) NOT NULL DEFAULT '',
    `picture` TEXT NULL,
    `email_verified` BOOLEAN NOT NULL DEFAULT false,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(32) NOT NULL DEFAULT 'UNCONFIRMED',
    `migrated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `members_email_key`(`email`),
    UNIQUE INDEX `members_cognito_username_key`(`cognito_username`),
    UNIQUE INDEX `members_preferred_username_key`(`preferred_username`),
    INDEX `members_nickname_idx`(`nickname`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `access_hash` CHAR(64) NOT NULL,
    `refresh_hash` CHAR(64) NOT NULL,
    `access_until` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `member_sessions_access_hash_key`(`access_hash`),
    UNIQUE INDEX `member_sessions_refresh_hash_key`(`refresh_hash`),
    INDEX `member_sessions_member_id_idx`(`member_id`),
    INDEX `member_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_challenges` (
    `member_id` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(24) NOT NULL,
    `digest` CHAR(64) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NOT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_challenges_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`member_id`, `purpose`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_rate_buckets` (
    `id` CHAR(64) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `auth_rate_buckets_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `member_sessions` ADD CONSTRAINT `member_sessions_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_challenges` ADD CONSTRAINT `member_challenges_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

