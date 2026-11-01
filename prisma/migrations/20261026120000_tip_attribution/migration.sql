-- Preserve the title at the time of support; legacy rows remain NULL.
ALTER TABLE `bean_tips` ADD COLUMN `post_title_snapshot` TEXT NULL;
