-- CreateTable
CREATE TABLE `token_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `symbol` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `token_types_symbol_key`(`symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `address` VARCHAR(191) NOT NULL,
    `token_type_id` INTEGER NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wallets_address_key`(`address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_ownerships` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wallet_id` INTEGER NOT NULL,
    `owner_address` VARCHAR(191) NOT NULL,
    `ownership_type` TINYINT NOT NULL,
    `share` INTEGER NOT NULL DEFAULT 100,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wallet_ownerships_wallet_id_owner_address_started_at_key`(`wallet_id`, `owner_address`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tx_hash` VARCHAR(191) NOT NULL,
    `from_wallet_id` INTEGER NOT NULL,
    `to_wallet_id` INTEGER NOT NULL,
    `token_type_id` INTEGER NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `balance_before` DECIMAL(18, 4) NOT NULL,
    `balance_after` DECIMAL(18, 4) NOT NULL,
    `reason` TINYINT NOT NULL,
    `reference_id` VARCHAR(191) NULL,
    `status` TINYINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `transfers_tx_hash_key`(`tx_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_token_type_id_fkey` FOREIGN KEY (`token_type_id`) REFERENCES `token_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ownerships` ADD CONSTRAINT `wallet_ownerships_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_token_type_id_fkey` FOREIGN KEY (`token_type_id`) REFERENCES `token_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_from_wallet_id_fkey` FOREIGN KEY (`from_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_to_wallet_id_fkey` FOREIGN KEY (`to_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
