-- AlterTable
ALTER TABLE `members` ADD COLUMN `identity_hash` CHAR(64) NULL;

-- AlterTable
ALTER TABLE `member_challenges` ADD COLUMN `target_email` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `identity_proofs` ADD COLUMN `attempt_id` VARCHAR(191) NOT NULL,
    ADD COLUMN `member_id` VARCHAR(191) NULL,
    ADD COLUMN `purpose` VARCHAR(191) NOT NULL DEFAULT 'signup';

-- AlterTable
ALTER TABLE `checkout_orders` ADD COLUMN `billing_method_id` VARCHAR(191) NULL,
    ADD COLUMN `period_start` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `settlement_accounts` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `withdrawal_authorizations` ADD COLUMN `account_version` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `identity_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `state_hash` CHAR(64) NOT NULL,
    `proof_encrypted` TEXT NULL,
    `member_id` VARCHAR(191) NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `provider_reference` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `identity_attempts_state_hash_key`(`state_hash`),
    UNIQUE INDEX `identity_attempts_provider_reference_key`(`provider_reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `locked_until` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `note` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `members_identity_hash_key` ON `members`(`identity_hash`);

-- CreateIndex
CREATE UNIQUE INDEX `identity_proofs_attempt_id_key` ON `identity_proofs`(`attempt_id`);

