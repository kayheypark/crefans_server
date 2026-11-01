-- Referral links and rewards (2026-11-01). One referral row per member; its id is the invite code.
CREATE TABLE `referrals` (
  `id` VARCHAR(191) NOT NULL,
  `member_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `referrals_member_id_key`(`member_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `referral_signups` (
  `id` VARCHAR(191) NOT NULL,
  `referral_id` VARCHAR(191) NOT NULL,
  `referrer_id` VARCHAR(191) NOT NULL,
  `member_id` VARCHAR(191) NOT NULL,
  `reward_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `reward_quantity` INTEGER NOT NULL DEFAULT 0,
  `reward_source` VARCHAR(20) NULL,
  `reward_source_id` VARCHAR(191) NULL,
  `rewarded_at` DATETIME(3) NULL,
  `clawed_back_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `referral_signups_member_id_key`(`member_id`),
  INDEX `referral_signups_referral_id_idx`(`referral_id`),
  INDEX `referral_signups_referrer_id_created_at_idx`(`referrer_id`, `created_at`),
  INDEX `referral_signups_reward_source_reward_source_id_idx`(`reward_source`, `reward_source_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
