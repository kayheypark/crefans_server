-- 2026-11-16 phone-number ownership check (OCTOMO) before the promotion 100콩: keyed hash only.
CREATE TABLE `member_phones` (
    `member_id` VARCHAR(191) NOT NULL,
    `phone_hash` VARCHAR(64) NOT NULL,
    `verified_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `member_phones_phone_hash_key`(`phone_hash`),
    PRIMARY KEY (`member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `phone_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `phone_hash` VARCHAR(64) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `phone_verifications_member_id_created_at_idx`(`member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
