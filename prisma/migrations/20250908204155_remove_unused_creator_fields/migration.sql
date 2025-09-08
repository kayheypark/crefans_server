/*
  Warnings:

  - You are about to drop the column `description` on the `creators` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `creators` table. All the data in the column will be lost.
  - You are about to drop the column `profile_image_url` on the `creators` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `creators` DROP COLUMN `description`,
    DROP COLUMN `name`,
    DROP COLUMN `profile_image_url`;
