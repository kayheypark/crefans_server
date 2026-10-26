CREATE TABLE `platform_audit_logs` (
 `id` VARCHAR(36) NOT NULL, `category` VARCHAR(24) NOT NULL,
 `action` VARCHAR(96) NOT NULL, `level` VARCHAR(8) NOT NULL,
 `actor_id` VARCHAR(191) NULL, `actor_role` VARCHAR(32) NULL,
 `ip` VARCHAR(45) NULL, `peer_ip` VARCHAR(45) NULL,
 `request_id` VARCHAR(36) NULL, `job_id` VARCHAR(64) NULL,
 `entity_id` VARCHAR(191) NULL, `source_id` VARCHAR(191) NULL,
 `release` VARCHAR(96) NOT NULL, `environment` VARCHAR(32) NOT NULL,
 `status_code` INTEGER NULL, `duration_ms` INTEGER NULL,
 `metadata` JSON NOT NULL, `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), UNIQUE INDEX `platform_audit_logs_source_id_key` (`source_id`),
 INDEX `platform_audit_logs_occurred_at_id_idx` (`occurred_at`,`id`),
 INDEX `platform_audit_logs_category_occurred_at_idx` (`category`,`occurred_at`),
 INDEX `platform_audit_logs_request_id_occurred_at_idx` (`request_id`,`occurred_at`),
 INDEX `platform_audit_logs_actor_id_occurred_at_idx` (`actor_id`,`occurred_at`),
 INDEX `platform_audit_logs_entity_id_occurred_at_idx` (`entity_id`,`occurred_at`),
 INDEX `platform_audit_logs_ip_occurred_at_idx` (`ip`,`occurred_at`),
 INDEX `platform_audit_logs_job_id_occurred_at_idx` (`job_id`,`occurred_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
