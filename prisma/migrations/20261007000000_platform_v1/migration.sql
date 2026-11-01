-- AlterTable
ALTER TABLE `creators` ADD COLUMN `about` TEXT NULL,
    ADD COLUMN `avatar` TEXT NULL,
    ADD COLUMN `bio` TEXT NULL,
    ADD COLUMN `comments_enabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `cover` TEXT NULL,
    ADD COLUMN `display_name` VARCHAR(191) NULL,
    ADD COLUMN `handle` VARCHAR(191) NULL,
    ADD COLUMN `links` JSON NULL,
    ADD COLUMN `promoted` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `membership_items` ADD COLUMN `image` TEXT NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `subscriptions` ADD COLUMN `plan_snapshot` JSON NULL;

-- AlterTable
ALTER TABLE `postings` ADD COLUMN `access_plan_id` VARCHAR(191) NULL,
    ADD COLUMN `scheduled_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `comments` ADD COLUMN `hidden` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mentions` JSON NULL;

-- CreateTable
CREATE TABLE `account_preferences` (
    `member_id` VARCHAR(191) NOT NULL,
    `content_alert` BOOLEAN NOT NULL DEFAULT true,
    `message_alert` BOOLEAN NOT NULL DEFAULT true,
    `marketing_alert` BOOLEAN NOT NULL DEFAULT false,
    `show_activity` BOOLEAN NOT NULL DEFAULT true,
    `allow_search` BOOLEAN NOT NULL DEFAULT true,
    `show_following` BOOLEAN NOT NULL DEFAULT true,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saved_posts` (
    `member_id` VARCHAR(191) NOT NULL,
    `posting_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`member_id`, `posting_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_blocks` (
    `member_id` VARCHAR(191) NOT NULL,
    `target_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`member_id`, `target_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `direct_messages` (
    `id` VARCHAR(191) NOT NULL,
    `sender_id` VARCHAR(191) NOT NULL,
    `recipient_id` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `direct_messages_recipient_id_created_at_idx`(`recipient_id`, `created_at`),
    INDEX `direct_messages_sender_id_recipient_id_created_at_idx`(`sender_id`, `recipient_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_notifications` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `text` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_notifications_member_id_created_at_idx`(`member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_tickets` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `reply` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `support_tickets_member_id_created_at_idx`(`member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_documents` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT '',
    `content` JSON NOT NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `service_documents_kind_published_idx`(`kind`, `published`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `signup_challenges` (
    `email` VARCHAR(191) NOT NULL,
    `code_hash` CHAR(64) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `sent_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `proof_hash` CHAR(64) NULL,
    `verified_at` DATETIME(3) NULL,

    PRIMARY KEY (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `identity_proofs` (
    `id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `provider_reference` VARCHAR(191) NOT NULL,
    `identity_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,

    UNIQUE INDEX `identity_proofs_token_hash_key`(`token_hash`),
    UNIQUE INDEX `identity_proofs_provider_reference_key`(`provider_reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membership_versions` (
    `id` VARCHAR(191) NOT NULL,
    `membership_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `membership_versions_membership_id_version_key`(`membership_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `billing_methods` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `billing_key_encrypted` TEXT NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `last_four` CHAR(4) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `billing_methods_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checkout_orders` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `membership_id` VARCHAR(191) NOT NULL,
    `snapshot` JSON NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `payment_key` VARCHAR(191) NULL,
    `subscription_id` VARCHAR(191) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `failure_code` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `checkout_orders_payment_key_key`(`payment_key`),
    UNIQUE INDEX `checkout_orders_idempotency_key_key`(`idempotency_key`),
    INDEX `checkout_orders_member_id_created_at_idx`(`member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `revenue_entries` (
    `id` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `gross` INTEGER NOT NULL,
    `reversals` INTEGER NOT NULL DEFAULT 0,
    `fees` INTEGER NOT NULL,
    `net` INTEGER NOT NULL,
    `available_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `revenue_entries_order_id_key`(`order_id`),
    INDEX `revenue_entries_creator_id_available_at_idx`(`creator_id`, `available_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settlement_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `bank` VARCHAR(191) NOT NULL,
    `holder_alias` VARCHAR(191) NOT NULL,
    `last_four` CHAR(4) NOT NULL,
    `account_encrypted` TEXT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `settlement_accounts_creator_id_idx`(`creator_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `withdrawal_credentials` (
    `creator_id` VARCHAR(191) NOT NULL,
    `pin_hash` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`creator_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `withdrawal_authorizations` (
    `id` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `withdrawal_requests` (
    `id` VARCHAR(191) NOT NULL,
    `creator_id` VARCHAR(191) NOT NULL,
    `request_key` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `account_label` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'requested',
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `withdrawal_requests_request_key_key`(`request_key`),
    INDEX `withdrawal_requests_creator_id_status_idx`(`creator_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `creators_handle_key` ON `creators`(`handle`);

