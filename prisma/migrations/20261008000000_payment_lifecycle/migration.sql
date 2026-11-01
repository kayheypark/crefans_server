ALTER TABLE `checkout_orders`
  ADD COLUMN `locked_until` DATETIME(3) NULL,
  ADD COLUMN `processing_started_at` DATETIME(3) NULL,
  ADD COLUMN `paid_at` DATETIME(3) NULL,
  ADD COLUMN `period_end` DATETIME(3) NULL;
