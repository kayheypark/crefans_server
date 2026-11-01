-- Per-menu console permissions and forced password change for operator accounts.
ALTER TABLE `admins` ADD COLUMN `permissions` JSON NULL,
    ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false;
