CREATE TABLE `post_metrics` (
 `posting_id` VARCHAR(191) NOT NULL,
 `feed` INTEGER NOT NULL DEFAULT 0, `detail` INTEGER NOT NULL DEFAULT 0,
 `shared` INTEGER NOT NULL DEFAULT 0, `kakao` INTEGER NOT NULL DEFAULT 0,
 `copy` INTEGER NOT NULL DEFAULT 0, `native` INTEGER NOT NULL DEFAULT 0,
 `external` INTEGER NOT NULL DEFAULT 0, `video` INTEGER NOT NULL DEFAULT 0,
 `visits` INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (`posting_id`),
 CONSTRAINT `post_metrics_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `post_view_windows` (
 `posting_id` VARCHAR(191) NOT NULL, `visitor_hash` CHAR(64) NOT NULL,
 `flags` INTEGER NOT NULL DEFAULT 0, `expires_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`posting_id`, `visitor_hash`), INDEX `post_view_windows_expires_at_idx` (`expires_at`),
 CONSTRAINT `post_view_windows_posting_id_fkey` FOREIGN KEY (`posting_id`) REFERENCES `postings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
