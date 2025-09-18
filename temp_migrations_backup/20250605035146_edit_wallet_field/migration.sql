/*
  Warnings:

  - You are about to drop the column `code` on the `transfer_reasons` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `transfer_reasons_code_key` ON `transfer_reasons`;

-- AlterTable
ALTER TABLE `transfer_reasons` DROP COLUMN `code`;
