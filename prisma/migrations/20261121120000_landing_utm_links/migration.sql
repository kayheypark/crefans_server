-- 2026-11-21 user request (유입 분석): daily AI photo landing visits per UTM combination. Aggregate only:
-- KST day, utm values, referrer host and a count — no member, guest id, IP, cookie or user agent, no per-visitor row.
-- '' means the value was absent. UTM values are ASCII-only by validation; binary collation keeps 'Cat' and 'cat' apart.
CREATE TABLE `landing_utm_daily` (
  `day` DATE NOT NULL,
  `source` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  `medium` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  `campaign` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  `content` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  `referrer_host` VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  `count` INTEGER NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`day`, `source`, `medium`, `campaign`, `content`, `referrer_host`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2026-11-21 user request (랜딩 링크 관리): operator-made landing links with fixed UTM values.
-- active_key is the UTM combination while the link is active and NULL once archived, so one combination has one active link.
CREATE TABLE `landing_links` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `landing_path` VARCHAR(64) NOT NULL,
  `utm_source` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `utm_medium` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `utm_campaign` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `utm_content` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  `memo` VARCHAR(500) NOT NULL DEFAULT '',
  `created_by` VARCHAR(191) NOT NULL,
  `active_key` VARCHAR(170) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `archived_at` DATETIME(3) NULL,
  UNIQUE INDEX `landing_links_active_key_key`(`active_key`),
  INDEX `landing_links_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
