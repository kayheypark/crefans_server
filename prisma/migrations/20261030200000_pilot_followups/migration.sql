-- 2026-10-30 /pilot-work follow-ups: bean refunds and 5-year validity, creator receivables, public reasons and mail notices for operator actions.
ALTER TABLE `bean_charges` ADD COLUMN `refunded_quantity` INTEGER NOT NULL DEFAULT 0, ADD COLUMN `refunded_amount` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `bean_lots` ADD COLUMN `expires_at` DATETIME(3) NULL, ADD COLUMN `expiry_noticed_at` DATETIME(3) NULL;
CREATE INDEX `bean_lots_expires_at_idx` ON `bean_lots`(`expires_at`);
-- Existing spendable lots get the same 5 years: purchased beans from payment, promotion beans from the grant.
UPDATE `bean_lots` l JOIN `bean_charges` c ON c.`id`=l.`charge_id` SET l.`expires_at`=DATE_ADD(COALESCE(c.`paid_at`,l.`created_at`),INTERVAL 5 YEAR) WHERE l.`bucket`='purchased';
UPDATE `bean_lots` SET `expires_at`=DATE_ADD(`created_at`,INTERVAL 5 YEAR) WHERE `bucket`='promotion';
ALTER TABLE `moderation_actions` ADD COLUMN `public_reason` VARCHAR(500) NULL;
CREATE TABLE `bean_refunds` (
 `id` VARCHAR(191) NOT NULL,`request_key` VARCHAR(191) NOT NULL,`charge_id` VARCHAR(191) NOT NULL,`member_id` VARCHAR(191) NOT NULL,`lot_id` VARCHAR(191) NOT NULL,
 `quantity` INTEGER NOT NULL,`gross` INTEGER NOT NULL,`deduction` INTEGER NOT NULL,`amount` INTEGER NOT NULL,`waived` BOOLEAN NOT NULL DEFAULT false,`actor_id` VARCHAR(191) NOT NULL,
 `status` VARCHAR(20) NOT NULL DEFAULT 'processing',`failure_code` VARCHAR(191) NULL,`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),`updated_at` DATETIME(3) NOT NULL,
 UNIQUE INDEX `bean_refunds_request_key_key`(`request_key`),INDEX `bean_refunds_charge_id_idx`(`charge_id`),INDEX `bean_refunds_status_updated_at_idx`(`status`,`updated_at`),PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `creator_receivables` (
 `id` VARCHAR(191) NOT NULL,`creator_id` VARCHAR(191) NOT NULL,`kind` VARCHAR(20) NOT NULL,`source_id` VARCHAR(191) NOT NULL,`amount` INTEGER NOT NULL,`status` VARCHAR(20) NOT NULL DEFAULT 'open',
 `note` VARCHAR(500) NOT NULL DEFAULT '',`settled_by` VARCHAR(191) NULL,`settled_at` DATETIME(3) NULL,`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE INDEX `creator_receivables_kind_source_id_creator_id_key`(`kind`,`source_id`,`creator_id`),INDEX `creator_receivables_creator_id_status_idx`(`creator_id`,`status`),PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `member_notices` (
 `id` VARCHAR(191) NOT NULL,`dedupe_key` VARCHAR(191) NOT NULL,`member_id` VARCHAR(191) NOT NULL,`kind` VARCHAR(40) NOT NULL,`rows` JSON NOT NULL,`path` VARCHAR(191) NOT NULL,`note` TEXT NOT NULL,
 `attempts` INTEGER NOT NULL DEFAULT 0,`retry_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),`locked_until` DATETIME(3) NULL,`completed_at` DATETIME(3) NULL,`outcome` VARCHAR(40) NULL,`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE INDEX `member_notices_dedupe_key_key`(`dedupe_key`),INDEX `member_notices_completed_at_retry_at_idx`(`completed_at`,`retry_at`),PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
