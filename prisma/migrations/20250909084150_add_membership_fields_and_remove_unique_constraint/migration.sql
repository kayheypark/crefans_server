/*
  Warnings:

  - Added the required column `benefits` to the `membership_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `membership_items` ADD COLUMN `benefits` TEXT NOT NULL,
    ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `trial_unit` ENUM('DAY', 'WEEK', 'MONTH', 'YEAR') NOT NULL DEFAULT 'DAY';

-- CreateIndex
CREATE INDEX `membership_items_creator_id_idx` ON `membership_items`(`creator_id`);

-- CreateIndex
CREATE INDEX `membership_items_creator_level_idx` ON `membership_items`(`creator_id`, `level`);
