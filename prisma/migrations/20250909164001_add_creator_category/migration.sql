-- AlterTable
ALTER TABLE `creators` ADD COLUMN `category_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `creator_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `color_code` VARCHAR(7) NULL,
    `icon` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `creator_categories_name_key`(`name`),
    INDEX `creator_categories_sort_order_idx`(`sort_order`),
    INDEX `creator_categories_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `creators_category_id_idx` ON `creators`(`category_id`);

-- AddForeignKey
ALTER TABLE `creators` ADD CONSTRAINT `creators_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `creator_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
