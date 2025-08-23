/*
  Warnings:

  - You are about to drop the `_TransferToTransferReason` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `transfer_reason_id` to the `transfers` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `_TransferToTransferReason` DROP FOREIGN KEY `_TransferToTransferReason_A_fkey`;

-- DropForeignKey
ALTER TABLE `_TransferToTransferReason` DROP FOREIGN KEY `_TransferToTransferReason_B_fkey`;

-- AlterTable
ALTER TABLE `transfers` ADD COLUMN `transfer_reason_id` INTEGER NOT NULL;

-- DropTable
DROP TABLE `_TransferToTransferReason`;
