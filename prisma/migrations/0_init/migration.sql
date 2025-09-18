-- CreateTable
CREATE TABLE `user_profiles` (
    `user_id` VARCHAR(191) NOT NULL,
    `bio` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `token_types` (
    `id` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,

    UNIQUE INDEX `token_types_symbol_key`(`symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallets` (
    `id` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `token_type_id` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wallets_address_key`(`address`),
    INDEX `wallets_token_type_id_fkey`(`token_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_ownerships` (
    `id` VARCHAR(191) NOT NULL,
    `wallet_id` VARCHAR(191) NOT NULL,
    `owner_id` VARCHAR(191) NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wallet_ownerships_wallet_id_owner_id_started_at_key`(`wallet_id`, `owner_id`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transfers` (
    `id` VARCHAR(191) NOT NULL,
    `tx_hash` VARCHAR(191) NOT NULL,
    `token_type_id` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `reason` TINYINT NOT NULL,
    `reference_id` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `from_balance_after` DECIMAL(18, 4) NOT NULL,
    `from_balance_before` DECIMAL(18, 4) NOT NULL,
    `to_balance_after` DECIMAL(18, 4) NOT NULL,
    `to_balance_before` DECIMAL(18, 4) NOT NULL,
    `subscription_id` VARCHAR(191) NULL,
    `transfer_reason_id` VARCHAR(191) NOT NULL,
    `from_wallet_address` VARCHAR(191) NOT NULL,
    `to_wallet_address` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `transfers_tx_hash_key`(`tx_hash`),
    INDEX `transfers_from_wallet_address_fkey`(`from_wallet_address`),
    INDEX `transfers_subscription_id_fkey`(`subscription_id`),
    INDEX `transfers_to_wallet_address_fkey`(`to_wallet_address`),
    INDEX `transfers_token_type_id_fkey`(`token_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `creator_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `color_code` VARCHAR(7) NULL,
    `icon` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `creator_categories_name_key`(`name`),
    INDEX `creator_categories_sort_order_idx`(`sort_order`),
    INDEX `creator_categories_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `creators` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `category_id` VARCHAR(191) NULL,

    UNIQUE INDEX `creators_user_id_key`(`user_id`),
    INDEX `creators_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transfer_reasons` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membership_items` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `creator_id` VARCHAR(191) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `billing_unit` ENUM('DAY', 'WEEK', 'MONTH', 'YEAR') NOT NULL,
    `billing_period` INTEGER NOT NULL DEFAULT 1,
    `trial_unit` ENUM('DAY', 'WEEK', 'MONTH', 'YEAR') NOT NULL DEFAULT 'DAY',
    `trial_period` INTEGER NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `benefits` TEXT NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,

    INDEX `membership_items_creator_id_idx`(`creator_id`),
    INDEX `membership_items_creator_level_idx`(`creator_id`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `subscriber_id` VARCHAR(191) NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `status` ENUM('ONGOING', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'ONGOING',
    `amount` DECIMAL(18, 4) NOT NULL,
    `auto_renew` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `membership_item_id` VARCHAR(191) NOT NULL,
    `billing_key` VARCHAR(191) NULL,
    `last_payment_date` DATETIME(3) NULL,
    `next_billing_date` DATETIME(3) NULL,
    `payment_failure_count` INTEGER NOT NULL DEFAULT 0,

    INDEX `subscriptions_membership_item_id_fkey`(`membership_item_id`),
    UNIQUE INDEX `subscriptions_subscriber_id_membership_item_id_started_at_key`(`subscriber_id`, `membership_item_id`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medias` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('IMAGE', 'VIDEO', 'AUDIO') NOT NULL,
    `original_name` VARCHAR(191) NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `file_path` VARCHAR(191) NULL,
    `file_size` INTEGER NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `thumbnail_path` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `original_url` VARCHAR(191) NOT NULL,
    `processed_at` DATETIME(3) NULL,
    `processed_urls` JSON NULL,
    `processing_job_id` VARCHAR(191) NULL,
    `processing_status` ENUM('UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'UPLOADING',
    `s3_processed_keys` JSON NULL,
    `s3_upload_key` VARCHAR(191) NOT NULL,
    `thumbnail_urls` JSON NULL,
    `user_sub` VARCHAR(191) NOT NULL,
    `duration` DOUBLE NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `posting_views` (
    `id` VARCHAR(191) NOT NULL,
    `posting_id` VARCHAR(191) NOT NULL,
    `viewer_id` VARCHAR(191) NULL,
    `viewer_ip` VARCHAR(191) NULL,
    `viewer_ua` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `posting_views_posting_id_viewer_id_viewer_ip_key`(`posting_id`, `viewer_id`, `viewer_ip`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `postings` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `is_membership` BOOLEAN NOT NULL DEFAULT false,
    `membership_level` INTEGER NULL,
    `publish_start_at` DATETIME(3) NULL,
    `publish_end_at` DATETIME(3) NULL,
    `total_view_count` INTEGER NOT NULL DEFAULT 0,
    `unique_view_count` INTEGER NOT NULL DEFAULT 0,
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `comment_count` INTEGER NOT NULL DEFAULT 0,
    `published_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `allow_individual_purchase` BOOLEAN NOT NULL DEFAULT false,
    `individual_purchase_price` DECIMAL(10, 0) NULL,
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `is_sensitive` BOOLEAN NOT NULL DEFAULT false,
    `user_sub` VARCHAR(191) NOT NULL,
    `allow_comments` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `posting_medias` (
    `id` VARCHAR(191) NOT NULL,
    `posting_id` VARCHAR(191) NOT NULL,
    `media_id` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_free_preview` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `posting_medias_media_id_fkey`(`media_id`),
    UNIQUE INDEX `posting_medias_posting_id_media_id_key`(`posting_id`, `media_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comments` (
    `id` VARCHAR(191) NOT NULL,
    `posting_id` VARCHAR(191) NOT NULL,
    `author_id` VARCHAR(191) NOT NULL,
    `tagged_user_id` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `parent_id` VARCHAR(191) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `comments_parent_id_fkey`(`parent_id`),
    INDEX `comments_posting_id_fkey`(`posting_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `posting_likes` (
    `id` VARCHAR(191) NOT NULL,
    `posting_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `posting_likes_posting_id_user_id_key`(`posting_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comment_likes` (
    `id` VARCHAR(191) NOT NULL,
    `comment_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `comment_likes_comment_id_user_id_key`(`comment_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `earlybirds` (
    `id` VARCHAR(191) NOT NULL,
    `user_sub` VARCHAR(191) NOT NULL,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rewarded` BOOLEAN NOT NULL DEFAULT false,
    `rewarded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `earlybirds_user_sub_key`(`user_sub`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_follows` (
    `id` VARCHAR(191) NOT NULL,
    `follower_id` VARCHAR(191) NOT NULL,
    `following_id` VARCHAR(191) NOT NULL,
    `followed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_follows_follower_id_idx`(`follower_id`),
    INDEX `user_follows_following_id_idx`(`following_id`),
    INDEX `user_follows_followed_at_idx`(`followed_at`),
    INDEX `user_follows_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `user_follows_follower_id_following_id_key`(`follower_id`, `following_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_delete_queue` (
    `id` VARCHAR(191) NOT NULL,
    `media_id` VARCHAR(191) NOT NULL,
    `s3_key` VARCHAR(191) NOT NULL,
    `original_url` VARCHAR(191) NOT NULL,
    `queue_reason` ENUM('ORPHANED', 'SOFT_DELETED', 'EXPIRED') NOT NULL,
    `grace_period_end` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    `queued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_delete_queue_media_id_key`(`media_id`),
    INDEX `media_delete_queue_status_idx`(`status`),
    INDEX `media_delete_queue_grace_period_end_idx`(`grace_period_end`),
    INDEX `media_delete_queue_queued_at_idx`(`queued_at`),
    INDEX `media_delete_queue_queue_reason_idx`(`queue_reason`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admins` (
    `id` VARCHAR(191) NOT NULL,
    `user_sub` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'MODERATOR') NOT NULL DEFAULT 'MODERATOR',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,

    UNIQUE INDEX `admins_user_sub_key`(`user_sub`),
    UNIQUE INDEX `admins_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_reports` (
    `id` VARCHAR(191) NOT NULL,
    `reporter_id` VARCHAR(191) NOT NULL,
    `target_type` ENUM('USER', 'POSTING', 'COMMENT') NOT NULL,
    `target_id` VARCHAR(191) NOT NULL,
    `reason` ENUM('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'COPYRIGHT', 'FRAUD', 'OTHER') NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('PENDING', 'REVIEWED', 'RESOLVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `admin_id` VARCHAR(191) NULL,
    `admin_note` TEXT NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_reports_target_type_target_id_idx`(`target_type`, `target_id`),
    INDEX `user_reports_reporter_id_idx`(`reporter_id`),
    INDEX `user_reports_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_suspensions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` ENUM('WARNING', 'TEMPORARY', 'PERMANENT') NOT NULL,
    `reason` TEXT NOT NULL,
    `start_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `end_date` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'LIFTED') NOT NULL DEFAULT 'ACTIVE',
    `admin_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_suspensions_user_id_idx`(`user_id`),
    INDEX `user_suspensions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `payment_key` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 0) NOT NULL,
    `token_amount` DECIMAL(18, 4) NOT NULL,
    `token_type_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'CANCELLED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `method` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `failure_code` VARCHAR(191) NULL,
    `failure_message` VARCHAR(191) NULL,
    `raw_response` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `subscription_id` VARCHAR(191) NULL,
    `billing_key` VARCHAR(191) NULL,
    `is_recurring` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `payment_transactions_order_id_key`(`order_id`),
    UNIQUE INDEX `payment_transactions_payment_key_key`(`payment_key`),
    INDEX `payment_transactions_user_id_idx`(`user_id`),
    INDEX `payment_transactions_status_idx`(`status`),
    INDEX `payment_transactions_order_id_idx`(`order_id`),
    INDEX `payment_transactions_subscription_id_fkey`(`subscription_id`),
    INDEX `payment_transactions_token_type_id_fkey`(`token_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `boards` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `category_id` VARCHAR(191) NOT NULL,
    `is_important` BOOLEAN NOT NULL DEFAULT false,
    `excerpt` TEXT NULL,
    `author` VARCHAR(191) NOT NULL DEFAULT '크리팬스 관리자',
    `views` INTEGER NOT NULL DEFAULT 0,
    `is_published` BOOLEAN NOT NULL DEFAULT true,
    `published_at` DATETIME(3) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `boards_category_id_idx`(`category_id`),
    INDEX `boards_is_published_idx`(`is_published`),
    INDEX `boards_published_at_idx`(`published_at`),
    INDEX `boards_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `board_views` (
    `id` VARCHAR(191) NOT NULL,
    `board_id` VARCHAR(191) NOT NULL,
    `ip_address` VARCHAR(191) NOT NULL,
    `viewed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `board_views_board_id_idx`(`board_id`),
    INDEX `board_views_ip_address_idx`(`ip_address`),
    INDEX `board_views_viewed_at_idx`(`viewed_at`),
    UNIQUE INDEX `board_views_board_id_ip_address_key`(`board_id`, `ip_address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `board_categories` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `board_categories_code_key`(`code`),
    INDEX `board_categories_sort_order_idx`(`sort_order`),
    INDEX `board_categories_is_public_idx`(`is_public`),
    INDEX `board_categories_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_token_type_id_fkey` FOREIGN KEY (`token_type_id`) REFERENCES `token_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ownerships` ADD CONSTRAINT `wallet_ownerships_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_from_wallet_address_fkey` FOREIGN KEY (`from_wallet_address`) REFERENCES `wallets`(`address`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_to_wallet_address_fkey` FOREIGN KEY (`to_wallet_address`) REFERENCES `wallets`(`address`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_token_type_id_fkey` FOREIGN KEY (`token_type_id`) REFERENCES `token_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `creators` ADD CONSTRAINT `creators_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `creator_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_membership_item_id_fkey` FOREIGN KEY (`membership_item_id`) REFERENCES `membership_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_views` ADD CONSTRAINT `posting_views_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_medias` ADD CONSTRAINT `posting_medias_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `medias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_medias` ADD CONSTRAINT `posting_medias_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posting_likes` ADD CONSTRAINT `posting_likes_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comment_likes` ADD CONSTRAINT `comment_likes_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_delete_queue` ADD CONSTRAINT `media_delete_queue_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `medias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_token_type_id_fkey` FOREIGN KEY (`token_type_id`) REFERENCES `token_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `boards` ADD CONSTRAINT `boards_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `board_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `board_views` ADD CONSTRAINT `board_views_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

