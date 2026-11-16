-- 2026-11-17 user decision: creator code follows the signed partnership contract (Schedule A, articles 8(3), 9(4), 12(2)).
-- Separate minimum for 콩 withdrawals; start/end dates for special terms (after the end the base terms apply again).
ALTER TABLE `signup_invites` ADD COLUMN `minimum_withdrawal_beans` INTEGER NULL;
ALTER TABLE `creator_financial_terms` ADD COLUMN `minimum_withdrawal_beans` INTEGER NULL, ADD COLUMN `special_starts_at` DATETIME(3) NULL, ADD COLUMN `special_ends_at` DATETIME(3) NULL;
ALTER TABLE `creator_financial_term_changes` ADD COLUMN `minimum_withdrawal_beans` INTEGER NULL, ADD COLUMN `special_starts_at` DATETIME(3) NULL, ADD COLUMN `special_ends_at` DATETIME(3) NULL;
