ALTER TABLE `members`
  ADD COLUMN `founding_badge_claimed_at` DATETIME(3) NULL,
  ADD COLUMN `founding_badge_visible` BOOLEAN NOT NULL DEFAULT false;

-- A stable row serializes this limited campaign without coupling it to money ledgers.
INSERT INTO `platform_settings` (`key`, `value`, `updated_at`)
VALUES ('event.founding-badge', JSON_OBJECT(), CURRENT_TIMESTAMP(3));
