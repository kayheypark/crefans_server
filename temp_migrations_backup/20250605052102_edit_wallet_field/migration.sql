/*
  Warnings:

  - You are about to alter the column `billing_unit` on the `membership_items` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(2))`.
  - Made the column `trial_unit` on table `membership_items` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `membership_items` MODIFY `billing_unit` ENUM('DAY', 'WEEK', 'MONTH', 'YEAR') NOT NULL,
    MODIFY `trial_unit` ENUM('DAY', 'WEEK', 'MONTH', 'YEAR') NOT NULL;
