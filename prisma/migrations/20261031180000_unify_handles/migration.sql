-- 2026-10-31: one public user name. members.preferred_username is the source, creators.handle follows it.
-- 1) A creator who chose a profile address keeps it as the user name, unless another member already uses that name.
UPDATE `members` m
JOIN `creators` c ON c.`user_id` = m.`id`
SET m.`preferred_username` = c.`handle`
WHERE c.`handle` IS NOT NULL
  AND c.`handle` <> m.`preferred_username`
  AND c.`handle` NOT IN (SELECT x.`pu` FROM (SELECT `preferred_username` AS `pu` FROM `members`) AS x);

-- 2) Every creator address then equals its member's user name, unless another creator already holds that value.
UPDATE `creators` c
JOIN `members` m ON m.`id` = c.`user_id`
SET c.`handle` = m.`preferred_username`
WHERE (c.`handle` IS NULL OR c.`handle` <> m.`preferred_username`)
  AND m.`preferred_username` NOT IN (SELECT y.`h` FROM (SELECT `handle` AS `h` FROM `creators` WHERE `handle` IS NOT NULL) AS y);
