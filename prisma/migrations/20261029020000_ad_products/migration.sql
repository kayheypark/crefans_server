CREATE TABLE `ad_products` (
 `id` VARCHAR(191) NOT NULL, `name` VARCHAR(100) NOT NULL,
 `description` TEXT NOT NULL, `terms` TEXT NOT NULL,
 `placement` VARCHAR(40) NOT NULL DEFAULT 'featured_creator',
 `amount` INTEGER NOT NULL, `duration_days` INTEGER NOT NULL,
 `visible` BOOLEAN NOT NULL DEFAULT false, `on_sale` BOOLEAN NOT NULL DEFAULT false,
 `sort_order` INTEGER NOT NULL DEFAULT 0, `version` INTEGER NOT NULL DEFAULT 1,
 `deleted_at` DATETIME(3) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updated_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), INDEX `ad_products_deleted_at_visible_sort_order_idx` (`deleted_at`,`visible`,`sort_order`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
