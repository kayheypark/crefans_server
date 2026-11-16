-- 2026-11-16 phone-number check at signup: a verified pending check is kept until the account is created.
ALTER TABLE `phone_verifications` ADD COLUMN `verified_at` DATETIME(3) NULL,
    ADD COLUMN `proof_hash` VARCHAR(64) NULL;
