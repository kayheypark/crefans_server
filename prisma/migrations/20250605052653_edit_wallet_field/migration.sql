/*
  Warnings:

  - Added the required column `price` to the `token_types` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `token_types` ADD COLUMN `price` DECIMAL(18, 4) NOT NULL;
