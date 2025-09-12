-- Add duration field to medias table for storing video length in seconds
ALTER TABLE `medias` ADD COLUMN `duration` DOUBLE NULL;