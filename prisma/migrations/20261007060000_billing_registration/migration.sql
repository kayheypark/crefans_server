-- AlterTable
ALTER TABLE `billing_methods` ADD COLUMN `customer_key` VARCHAR(36) NULL,
    ADD COLUMN `masked_number` VARCHAR(24) NULL,
    ADD COLUMN `revoke_attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `revoke_retry_at` DATETIME(3) NULL,
    ADD COLUMN `revoked_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `billing_customers` (
    `member_id` VARCHAR(191) NOT NULL,
    `customer_key` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `billing_customers_customer_key_key`(`customer_key`),
    PRIMARY KEY (`member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `billing_registrations` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `customer_key` VARCHAR(36) NOT NULL,
    `state_hash` CHAR(64) NOT NULL,
    `return_path` VARCHAR(250) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
    `auth_key_encrypted` TEXT NULL,
    `billing_method_id` VARCHAR(191) NULL,
    `locked_until` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `billing_registrations_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

