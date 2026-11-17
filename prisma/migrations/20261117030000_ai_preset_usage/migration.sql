-- 2026-11-17 user decision: count which AI photo presets are used (HOT badges and ordering later). Aggregate only:
-- KST day, edit kind, preset key and a count — no member, visitor, IP or request is stored.
CREATE TABLE `ai_preset_usage_daily` (
  `day` DATE NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `preset_key` VARCHAR(64) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`day`, `kind`, `preset_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
