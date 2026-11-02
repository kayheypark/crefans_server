-- Watermark follow-ups (2026-11-02 user decisions): follower notices wait until a post's media is processed,
-- and handles given up by a profile change stay reserved and link to the current profile.
ALTER TABLE `postings` ADD COLUMN `notify_pending` BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE `retired_handles` (
 `handle` VARCHAR(64) NOT NULL, `member_id` VARCHAR(191) NOT NULL, `retired_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`handle`), INDEX `retired_handles_member_id_idx` (`member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
