-- Withdrawn members' handles stay reserved as text only, unlinked from the member (2026-11-02 user decision).
ALTER TABLE `retired_handles` MODIFY `member_id` VARCHAR(191) NULL;
