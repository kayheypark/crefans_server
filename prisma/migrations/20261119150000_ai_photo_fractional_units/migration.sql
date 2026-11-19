-- A binary double represents integers and half-integers exactly. Existing balances retain their value.
ALTER TABLE auth_rate_buckets MODIFY count DOUBLE NOT NULL DEFAULT 1, ADD quota_generation CHAR(36) NULL;
ALTER TABLE ai_photo_reset_ticket_uses MODIFY used_before DOUBLE NOT NULL;
ALTER TABLE ai_shop_orders MODIFY remaining DOUBLE NOT NULL DEFAULT 0, MODIFY refund_quantity DOUBLE NULL;
ALTER TABLE ai_shop_uses ADD units DOUBLE NOT NULL DEFAULT 1, ADD request_id VARCHAR(191) NULL, ADD INDEX ai_shop_uses_request_id_idx (request_id);
ALTER TABLE ai_heart_wallets MODIFY credits DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE ai_heart_uses ADD units DOUBLE NOT NULL DEFAULT 1;
