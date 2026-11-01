-- Referral rewards are credited after a 7-day refund window (user decision 2026-11-01).
ALTER TABLE `referral_signups` ADD COLUMN `grant_due_at` DATETIME(3) NULL;
CREATE INDEX `referral_signups_reward_status_grant_due_at_idx` ON `referral_signups`(`reward_status`, `grant_due_at`);
