-- 2026-11-16 bank transfer (무통장입금) for beans, AI 이용권 and advertising.
ALTER TABLE `ad_purchases` ADD COLUMN `request_key` VARCHAR(100) NULL,
    ADD COLUMN `payment_method` VARCHAR(20) NULL,
    ADD COLUMN `refund_amount` INTEGER NULL,
    ADD COLUMN `refunded_at` DATETIME(3) NULL;
CREATE UNIQUE INDEX `ad_purchases_request_key_key` ON `ad_purchases`(`request_key`);

CREATE TABLE `bank_transfer_accounts` (
    `id` VARCHAR(20) NOT NULL,
    `bank_name` VARCHAR(40) NOT NULL,
    `account_number` VARCHAR(40) NOT NULL,
    `holder` VARCHAR(40) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `updated_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `bank_transfer_payments` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `depositor_name` VARCHAR(40) NOT NULL,
    `account_snapshot` JSON NOT NULL,
    `cash_receipt_type` VARCHAR(10) NULL,
    `cash_receipt_number_encrypted` TEXT NULL,
    `cash_receipt_issued_at` DATETIME(3) NULL,
    `cash_receipt_reference` VARCHAR(191) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'awaiting',
    `expires_at` DATETIME(3) NOT NULL,
    `received_at` DATETIME(3) NULL,
    `deposit_reference` VARCHAR(191) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `confirmed_by` VARCHAR(191) NULL,
    `cancel_reason` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `bank_transfer_payments_kind_order_id_key`(`kind`, `order_id`),
    INDEX `bank_transfer_payments_status_expires_at_idx`(`status`, `expires_at`),
    INDEX `bank_transfer_payments_member_id_created_at_idx`(`member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `manual_refunds` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `refund_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `bank_name` VARCHAR(40) NOT NULL,
    `account_encrypted` TEXT NOT NULL,
    `holder_encrypted` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'requested',
    `due_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `transfer_reference` VARCHAR(191) NULL,
    `reject_reason` VARCHAR(200) NULL,
    `actor_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `manual_refunds_kind_refund_id_key`(`kind`, `refund_id`),
    INDEX `manual_refunds_status_due_at_idx`(`status`, `due_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
