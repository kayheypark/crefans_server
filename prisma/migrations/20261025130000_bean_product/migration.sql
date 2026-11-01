-- CreateTable
CREATE TABLE `bean_charges` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `request_key` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `amount` INTEGER NOT NULL,
    `environment` VARCHAR(10) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `payment_key` VARCHAR(191) NULL,
    `locked_until` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `paid_at` DATETIME(3) NULL,
    `receipt_confirmed_at` DATETIME(3) NULL,
    `receipt_reference` VARCHAR(191) NULL,
    `received_amount` INTEGER NULL,
    `failure_code` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bean_charges_request_key_key`(`request_key`),
    UNIQUE INDEX `bean_charges_payment_key_key`(`payment_key`),
    INDEX `bean_charges_member_id_created_at_idx`(`member_id`, `created_at`),
    INDEX `bean_charges_status_updated_at_idx`(`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bean_lots` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `bucket` VARCHAR(40) NOT NULL,
    `charge_id` VARCHAR(191) NULL,
    `grant_id` VARCHAR(191) NULL,
    `available` INTEGER NOT NULL,
    `reserved` INTEGER NOT NULL DEFAULT 0,
    `release_at` DATETIME(3) NOT NULL,
    `frozen` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bean_lots_member_id_bucket_created_at_idx`(`member_id`, `bucket`, `created_at`),
    INDEX `bean_lots_charge_id_idx`(`charge_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bean_tips` (
    `id` VARCHAR(191) NOT NULL,
    `request_key` VARCHAR(191) NOT NULL,
    `sender_id` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `post_id` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `paid_quantity` INTEGER NOT NULL,
    `promotion_quantity` INTEGER NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bean_tips_request_key_key`(`request_key`),
    INDEX `bean_tips_sender_id_created_at_idx`(`sender_id`, `created_at`),
    INDEX `bean_tips_creator_id_created_at_idx`(`creator_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bean_tip_allocations` (
    `id` VARCHAR(191) NOT NULL,
    `tip_id` VARCHAR(191) NOT NULL,
    `source_lot_id` VARCHAR(191) NOT NULL,
    `target_lot_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,

    UNIQUE INDEX `bean_tip_allocations_target_lot_id_key`(`target_lot_id`),
    INDEX `bean_tip_allocations_tip_id_idx`(`tip_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bean_promotions` (
    `id` VARCHAR(191) NOT NULL,
    `request_key` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bean_promotions_request_key_key`(`request_key`),
    INDEX `bean_promotions_member_id_created_at_idx`(`member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bean_payouts` (
    `id` VARCHAR(191) NOT NULL,
    `request_key` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `account_version` INTEGER NOT NULL,
    `account_label` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `gross` INTEGER NOT NULL,
    `fee` INTEGER NOT NULL,
    `net` INTEGER NOT NULL,
    `fee_bps` INTEGER NOT NULL,
    `environment` VARCHAR(10) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'requested',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `approved_by` VARCHAR(191) NULL,
    `locked_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bean_payouts_request_key_key`(`request_key`),
    INDEX `bean_payouts_creator_id_created_at_idx`(`creator_id`, `created_at`),
    INDEX `bean_payouts_status_updated_at_idx`(`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bean_payout_allocations` (
    `id` VARCHAR(191) NOT NULL,
    `payout_id` VARCHAR(191) NOT NULL,
    `lot_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,

    UNIQUE INDEX `bean_payout_allocations_payout_id_lot_id_key`(`payout_id`, `lot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bean_withdrawal_authorizations` (
    `id` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `account_version` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,

    INDEX `bean_withdrawal_authorizations_creator_id_expires_at_idx`(`creator_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

