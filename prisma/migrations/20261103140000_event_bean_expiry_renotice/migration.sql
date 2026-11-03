-- Event promotion beans (30-day validity) were noticed right after the claim by the 30-day expiry notice.
-- Clear only those early notices so the new 7-day event notice is sent once. Data-only; repeat runs change nothing.
UPDATE `bean_lots` l
JOIN `bean_promotions` g ON g.`id` = l.`grant_id` AND g.`actor_id` = 'system:event:promotion-beans-v1'
SET l.`expiry_noticed_at` = NULL
WHERE l.`expiry_noticed_at` IS NOT NULL
  AND l.`available` > 0
  AND l.`expires_at` > DATE_ADD(l.`expiry_noticed_at`, INTERVAL 7 DAY);
