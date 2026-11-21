-- 2026-11-21 user request: a review (1–5 stars, good/bad/unsure, optional words) instead of the heart game while a repeat
-- generation runs. guest_day is the KST day for signed-out visitors (one review a day) and NULL for members (one per success).
CREATE TABLE `ai_photo_reviews` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `guest` BOOLEAN NOT NULL DEFAULT false,
  `rating` TINYINT NOT NULL,
  `sentiment` VARCHAR(10) NOT NULL,
  `comment` TEXT NULL,
  `reward_hearts` INTEGER NOT NULL DEFAULT 0,
  `reward_tickets` DOUBLE NOT NULL DEFAULT 0,
  `guest_day` DATE NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ai_photo_reviews_user_id_guest_day_key`(`user_id`, `guest_day`),
  INDEX `ai_photo_reviews_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
