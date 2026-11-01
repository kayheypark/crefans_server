CREATE TABLE `platform_security_ips` (
 `ip` VARCHAR(45) NOT NULL,
 `blocked_until` DATETIME(3) NULL,
 `window_start` DATETIME(3) NOT NULL,
 `count` INTEGER NOT NULL DEFAULT 0,
 `detected_at` DATETIME(3) NULL,
 PRIMARY KEY (`ip`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
