/*
  Warnings:

  - You are about to drop the column `balance_after` on the `transfers` table. All the data in the column will be lost.
  - You are about to drop the column `balance_before` on the `transfers` table. All the data in the column will be lost.
  - You are about to alter the column `status` on the `transfers` table. The data in that column could be lost. The data in that column will be cast from `TinyInt` to `Enum(EnumId(0))`.
  - Added the required column `from_balance_after` to the `transfers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `from_balance_before` to the `transfers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `to_balance_after` to the `transfers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `to_balance_before` to the `transfers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `transfers` DROP COLUMN `balance_after`,
    DROP COLUMN `balance_before`,
    ADD COLUMN `from_balance_after` DECIMAL(18, 4) NOT NULL,
    ADD COLUMN `from_balance_before` DECIMAL(18, 4) NOT NULL,
    ADD COLUMN `to_balance_after` DECIMAL(18, 4) NOT NULL,
    ADD COLUMN `to_balance_before` DECIMAL(18, 4) NOT NULL,
    MODIFY `status` ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE `transfer_reasons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `transfer_reasons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_TransferToTransferReason` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_TransferToTransferReason_AB_unique`(`A`, `B`),
    INDEX `_TransferToTransferReason_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_TransferToTransferReason` ADD CONSTRAINT `_TransferToTransferReason_A_fkey` FOREIGN KEY (`A`) REFERENCES `transfers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_TransferToTransferReason` ADD CONSTRAINT `_TransferToTransferReason_B_fkey` FOREIGN KEY (`B`) REFERENCES `transfer_reasons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
