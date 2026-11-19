CREATE TABLE `ai_costume_fit_reviews` (
  `costume_id` VARCHAR(6) NOT NULL,
  `pose` VARCHAR(191) NOT NULL,
  `policy_failures` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `fitting_failures` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `last_failed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`costume_id`, `pose`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
