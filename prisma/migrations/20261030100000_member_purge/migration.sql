-- Withdrawn members: personal data purge 30 days after withdrawal.
ALTER TABLE `members` ADD COLUMN `withdrawn_at` DATETIME(3) NULL,
    ADD COLUMN `purged_at` DATETIME(3) NULL;
CREATE INDEX `members_withdrawn_at_purged_at_idx` ON `members`(`withdrawn_at`, `purged_at`);
