/*
  Warnings:

  - The values [CANCELLED] on the enum `subscriptions_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `subscriptions` MODIFY `status` ENUM('ONGOING', 'EXPIRED') NOT NULL DEFAULT 'ONGOING';

-- CreateTable
CREATE TABLE `wallet_creation_queues` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(191) NOT NULL,
    `token_type_id` INTEGER NOT NULL,
    `failure_reason` VARCHAR(191) NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `max_retries` INTEGER NOT NULL DEFAULT 3,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wallet_creation_queues` ADD CONSTRAINT `wallet_creation_queues_token_type_id_fkey` FOREIGN KEY (`token_type_id`) REFERENCES `token_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
