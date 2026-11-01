ALTER TABLE `billing_methods`
 ADD COLUMN `unavailable_at` DATETIME(3) NULL,
 ADD COLUMN `unavailable_reason` VARCHAR(80) NULL;
CREATE TABLE `billing_notices` (
 `id` VARCHAR(191) NOT NULL,
 `dedupe_key` VARCHAR(191) NOT NULL,
 `member_id` VARCHAR(191) NOT NULL,
 `subscription_id` VARCHAR(191) NOT NULL,
 `order_id` VARCHAR(191) NULL,
 `kind` VARCHAR(40) NOT NULL,
 `action_required` BOOLEAN NOT NULL DEFAULT false,
 `attempts` INTEGER NOT NULL DEFAULT 0,
 `retry_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `locked_until` DATETIME(3) NULL,
 `completed_at` DATETIME(3) NULL,
 `outcome` VARCHAR(40) NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE INDEX `billing_notices_dedupe_key_key` (`dedupe_key`),
 INDEX `billing_notices_completed_at_retry_at_idx` (`completed_at`, `retry_at`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
