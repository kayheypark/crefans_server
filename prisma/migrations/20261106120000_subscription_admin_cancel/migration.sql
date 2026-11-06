ALTER TABLE `subscriptions`
 ADD COLUMN `cancel_reason` VARCHAR(500) NULL,
 ADD COLUMN `cancelled_by` VARCHAR(191) NULL;
