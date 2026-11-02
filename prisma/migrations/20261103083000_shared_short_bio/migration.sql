-- Preserve the short biography currently shown on public creator profiles.
-- Back up the database and stop old API/worker writers before this contract migration.
-- The creator's long `about`, profile cover and original creation date are unchanged.
UPDATE `user_profiles` p
INNER JOIN `creators` c ON c.`user_id` = p.`user_id`
SET p.`bio` = c.`bio`, p.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE c.`bio` IS NOT NULL AND CHAR_LENGTH(c.`bio`) > 0;

INSERT INTO `user_profiles` (`user_id`, `bio`, `created_at`, `updated_at`)
SELECT c.`user_id`, c.`bio`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `creators` c
LEFT JOIN `user_profiles` p ON p.`user_id` = c.`user_id`
WHERE p.`user_id` IS NULL;

ALTER TABLE `creators` DROP COLUMN `bio`;
