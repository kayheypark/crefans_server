/*
  Warnings:

  - You are about to drop the column `creator_id` on the `postings` table. All the data in the column will be lost.
  - Added the required column `user_sub` to the `postings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `postings` DROP COLUMN `creator_id`,
    ADD COLUMN `is_sensitive` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `user_sub` VARCHAR(191) NOT NULL;
