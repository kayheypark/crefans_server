-- Fan comments can be edited by their author; edited_at drives the "수정됨" label.
ALTER TABLE `comments` ADD COLUMN `edited_at` DATETIME(3) NULL;
