/*
  Warnings:

  - The primary key for the `medias` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `wallet_creation_queues` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `original_url` to the `medias` table without a default value. This is not possible if the table is not empty.
  - Added the required column `s3_upload_key` to the `medias` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_sub` to the `medias` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `posting_medias` DROP FOREIGN KEY `posting_medias_media_id_fkey`;

-- DropForeignKey
ALTER TABLE `wallet_creation_queues` DROP FOREIGN KEY `wallet_creation_queues_token_type_id_fkey`;

-- AlterTable
ALTER TABLE `medias` DROP PRIMARY KEY,
    ADD COLUMN `original_url` VARCHAR(191) NOT NULL,
    ADD COLUMN `processed_at` DATETIME(3) NULL,
    ADD COLUMN `processed_urls` JSON NULL,
    ADD COLUMN `processing_job_id` VARCHAR(191) NULL,
    ADD COLUMN `processing_status` ENUM('UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'UPLOADING',
    ADD COLUMN `s3_processed_keys` JSON NULL,
    ADD COLUMN `s3_upload_key` VARCHAR(191) NOT NULL,
    ADD COLUMN `thumbnail_urls` JSON NULL,
    ADD COLUMN `user_sub` VARCHAR(191) NOT NULL,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `file_path` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `posting_medias` MODIFY `media_id` VARCHAR(191) NOT NULL;

-- DropTable
DROP TABLE `wallet_creation_queues`;

-- AddForeignKey
ALTER TABLE `posting_medias` ADD CONSTRAINT `posting_medias_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `medias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
