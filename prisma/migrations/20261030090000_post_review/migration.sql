-- Beta post-publication review: operators mark posts reviewed; an author edit sends the post back to the queue.
ALTER TABLE `postings` ADD COLUMN `reviewed_at` DATETIME(3) NULL,
    ADD COLUMN `reviewed_by` VARCHAR(191) NULL;
CREATE INDEX `postings_review_queue_idx` ON `postings`(`status`, `is_deleted`, `reviewed_at`, `created_at`);
