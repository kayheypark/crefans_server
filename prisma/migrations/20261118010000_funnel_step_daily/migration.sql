-- 2026-11-18 user decision ("방법 1 서버 집계"): daily counts of the AI photo trial funnel steps. Aggregate only:
-- KST day, step key and a count — no member, guest id, IP, cookie or user agent is stored.
CREATE TABLE `funnel_step_daily` (
  `day` DATE NOT NULL,
  `step` VARCHAR(32) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`day`, `step`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
