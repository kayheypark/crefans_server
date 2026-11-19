ALTER TABLE `ai_costume_fit_reviews`
  ADD COLUMN `verified_base_sha256` CHAR(64) NULL,
  ADD COLUMN `last_verified_at` DATETIME(3) NULL;
