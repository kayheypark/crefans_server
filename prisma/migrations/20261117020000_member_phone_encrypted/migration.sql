-- 2026-11-17 user decision: operators see members' phone numbers in the console (masked, full number on an audited reveal) and
-- search by number. Numbers checked from now on are kept encrypted (AES-256-GCM, DATA_ENCRYPTION_KEY); earlier rows keep only the hash.
ALTER TABLE `member_phones` ADD COLUMN `phone_encrypted` TEXT NULL, ADD COLUMN `last_four` CHAR(4) NULL;
