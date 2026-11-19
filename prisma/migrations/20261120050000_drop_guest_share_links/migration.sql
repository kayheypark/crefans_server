-- 2026-11-20 user decision: the share reward is paid at the share itself, so short share codes (sharer id, IP hash) are no longer kept.
DROP TABLE IF EXISTS guest_share_links;
