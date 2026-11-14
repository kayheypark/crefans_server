CREATE TABLE `ai_photo_failure_details` (
 `request_id` VARCHAR(36) NOT NULL,
 `payload_encrypted` LONGTEXT NOT NULL,
 `expires_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`request_id`), INDEX `ai_photo_failure_details_expires_at_idx` (`expires_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
