-- CreateTable
CREATE TABLE `ai_shop_products` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NOT NULL,
    `amount` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `validity_days` INTEGER NOT NULL,
    `visible` BOOLEAN NOT NULL DEFAULT false,
    `on_sale` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_shop_orders` (
    `id` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `request_key` VARCHAR(100) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `amount` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `validity_days` INTEGER NOT NULL,
    `terms` TEXT NOT NULL,
    `environment` VARCHAR(10) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `remaining` INTEGER NOT NULL DEFAULT 0,
    `payment_key` VARCHAR(200) NULL,
    `locked_until` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `refund_amount` INTEGER NULL,
    `refund_quantity` INTEGER NULL,
    `refunded_at` DATETIME(3) NULL,
    `failure_code` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_shop_orders_request_key_key`(`request_key`),
    INDEX `ai_shop_orders_creator_id_status_expires_at_idx`(`creator_id`, `status`, `expires_at`),
    INDEX `ai_shop_orders_status_locked_until_idx`(`status`, `locked_until`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_shop_uses` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'reserved',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_shop_uses_order_id_status_idx`(`order_id`, `status`),
    INDEX `ai_shop_uses_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

