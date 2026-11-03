ALTER TABLE `ad_products`
  ADD COLUMN `comparison_amount` INTEGER NULL,
  ADD COLUMN `comparison_basis` VARCHAR(200) NOT NULL DEFAULT '';
