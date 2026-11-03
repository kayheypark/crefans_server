ALTER TABLE `creators` ADD COLUMN `ad_promoted_until` DATETIME(3) NULL;
CREATE TABLE `ad_purchases` (
 `id` VARCHAR(191) NOT NULL, `creator_id` VARCHAR(191) NOT NULL, `product_id` VARCHAR(191) NOT NULL,
 `name` VARCHAR(100) NOT NULL, `terms` TEXT NOT NULL, `amount` INTEGER NOT NULL, `duration_days` INTEGER NOT NULL,
 `placement` VARCHAR(40) NOT NULL DEFAULT 'featured_creator', `status` VARCHAR(20) NOT NULL DEFAULT 'processing',
 `starts_at` DATETIME(3) NULL, `ends_at` DATETIME(3) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
 INDEX `ad_purchases_creator_id_created_at_id_idx` (`creator_id`, `created_at`, `id`),
 INDEX `ad_purchases_creator_id_status_ends_at_idx` (`creator_id`, `status`, `ends_at`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
