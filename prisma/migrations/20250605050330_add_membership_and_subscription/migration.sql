-- AlterTable
ALTER TABLE `transfers` ADD COLUMN `subscription_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `membership_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `creator_id` VARCHAR(191) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `billing_unit` VARCHAR(191) NOT NULL DEFAULT 'MONTH',
    `billing_period` INTEGER NOT NULL DEFAULT 1,
    `trial_unit` VARCHAR(191) NULL DEFAULT 'MONTH',
    `trial_period` INTEGER NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscriber_id` VARCHAR(191) NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `status` ENUM('ONGOING', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'ONGOING',
    `amount` DECIMAL(18, 4) NOT NULL,
    `auto_renew` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `membership_item_id` INTEGER NOT NULL,

    UNIQUE INDEX `subscriptions_subscriber_id_membership_item_id_started_at_key`(`subscriber_id`, `membership_item_id`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_membership_item_id_fkey` FOREIGN KEY (`membership_item_id`) REFERENCES `membership_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
