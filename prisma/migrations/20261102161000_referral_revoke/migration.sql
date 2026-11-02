-- Operator exclusion/reclaim of a referral reward keeps its reason and operator on the row (2026-11-02 user decision).
ALTER TABLE `referral_signups` ADD COLUMN `revoke_reason` VARCHAR(500) NULL, ADD COLUMN `revoked_by` VARCHAR(191) NULL;
