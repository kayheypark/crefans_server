-- Members withdrawn before withdrawn_at existed (decision 2026-10-30): start their 30-day purge window at deployment.
-- Withdrawal is the only path that disables a member (Cognito is not used), so every disabled member without a timestamp is included.
UPDATE `members` SET `withdrawn_at` = CURRENT_TIMESTAMP(3)
WHERE `enabled` = 0 AND `withdrawn_at` IS NULL AND `purged_at` IS NULL;
