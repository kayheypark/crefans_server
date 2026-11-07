-- Post unpublish (2026-11-07): who changed a post's visibility. Existing rows are operator actions.
ALTER TABLE `moderation_actions` ADD COLUMN `actor_type` VARCHAR(20) NOT NULL DEFAULT 'ADMIN';
