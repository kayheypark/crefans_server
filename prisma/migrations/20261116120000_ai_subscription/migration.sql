-- 2026-11-16 AI 이용권 구독형 (monthly card billing) next to 횟수형.
ALTER TABLE `ai_shop_products` ADD COLUMN `kind` VARCHAR(20) NOT NULL DEFAULT 'pack';

CREATE TABLE `ai_subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `product_snapshot` JSON NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `environment` VARCHAR(10) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `billing_key_encrypted` TEXT NULL,
    `card_label` VARCHAR(60) NULL,
    `current_period_start` DATETIME(3) NULL,
    `current_period_end` DATETIME(3) NULL,
    `next_charge_at` DATETIME(3) NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `last_failure_code` VARCHAR(100) NULL,
    `cancel_requested_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `locked_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `ai_subscriptions_creator_id_status_idx`(`creator_id`, `status`),
    INDEX `ai_subscriptions_status_next_charge_at_idx`(`status`, `next_charge_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_subscription_charges` (
    `id` VARCHAR(191) NOT NULL,
    `subscription_id` VARCHAR(191) NOT NULL,
    `moid` VARCHAR(64) NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'processing',
    `provider_tid` VARCHAR(100) NULL,
    `order_id` VARCHAR(191) NULL,
    `failure_code` VARCHAR(100) NULL,
    `refund_amount` INTEGER NULL,
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `ai_subscription_charges_moid_key`(`moid`),
    INDEX `ai_subscription_charges_subscription_id_created_at_idx`(`subscription_id`, `created_at`),
    INDEX `ai_subscription_charges_status_updated_at_idx`(`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
