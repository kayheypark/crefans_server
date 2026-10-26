CREATE TABLE `platform_operational_events` (
 `id` VARCHAR(36) NOT NULL,
 `type` VARCHAR(64) NOT NULL,
 `data` JSON NOT NULL,
 `ip` VARCHAR(45) NULL,
 `peer_ip` VARCHAR(45) NULL,
 `request_id` VARCHAR(36) NULL,
 `dedupe_key` VARCHAR(191) NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `attempts` INTEGER NOT NULL DEFAULT 0,
 `locked_until` DATETIME(3) NULL,
 `delivered_at` DATETIME(3) NULL,
 `last_error_code` VARCHAR(64) NULL,
 UNIQUE INDEX `platform_operational_events_dedupe_key_key` (`dedupe_key`),
 INDEX `platform_operations_dispatch_idx` (`delivered_at`,`available_at`,`locked_until`),
 INDEX `platform_operational_events_created_at_idx` (`created_at`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
