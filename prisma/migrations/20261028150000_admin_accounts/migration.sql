-- Operator accounts get their own credentials and sessions, separate from fan/creator members.
-- AlterTable
ALTER TABLE `admins` ADD COLUMN `password_hash` VARCHAR(255) NULL,
    ADD COLUMN `phone` VARCHAR(32) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE `admin_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `admin_id` VARCHAR(191) NOT NULL,
    `access_hash` CHAR(64) NOT NULL,
    `refresh_hash` CHAR(64) NOT NULL,
    `access_until` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_sessions_access_hash_key`(`access_hash`),
    UNIQUE INDEX `admin_sessions_refresh_hash_key`(`refresh_hash`),
    INDEX `admin_sessions_admin_id_idx`(`admin_id`),
    INDEX `admin_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_sessions` ADD CONSTRAINT `admin_sessions_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing operators keep signing in with the same password: copy the hash (never plaintext) once.
UPDATE `admins` a JOIN `members` m ON m.`id` = a.`user_sub`
   SET a.`password_hash` = m.`password_hash`, a.`phone` = LEFT(m.`phone_number`, 32)
 WHERE a.`password_hash` IS NULL;

-- Login members created only for console operators (release operators-20261028) are no longer needed.
DELETE m FROM `members` m JOIN `admins` a ON a.`user_sub` = m.`id`
 WHERE m.`preferred_username` LIKE 'op\_%';
