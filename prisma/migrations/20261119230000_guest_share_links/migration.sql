-- 2026-11-19: short AI result share links. Rows expire after 7 days and are removed when new links are made.
CREATE TABLE guest_share_links (
  code CHAR(8) NOT NULL,
  guest_id VARCHAR(64) NOT NULL,
  ip_hash CHAR(32) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (code),
  INDEX guest_share_links_expires_at_idx (expires_at)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
