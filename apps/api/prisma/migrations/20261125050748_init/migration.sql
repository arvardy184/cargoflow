-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(30) NOT NULL,
    `fullName` VARCHAR(120) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `role` ENUM('ADMIN', 'OPERATIONS') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` ( 
    `id` VARCHAR(30) NOT NULL,
    `companyName` VARCHAR(150) NOT NULL,
    `contactPerson` VARCHAR(120) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_companyName_key`(`companyName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Container` (
    `id` VARCHAR(30) NOT NULL,
    `containerNumber` VARCHAR(11) NOT NULL,
    `containerType` ENUM('DRY_20', 'DRY_40', 'HIGH_CUBE_40', 'REEFER_20', 'REEFER_40') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Container_containerNumber_key`(`containerNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shipment` (
    `id` VARCHAR(30) NOT NULL,
    `shipmentNumber` VARCHAR(20) NOT NULL,
    `customerId` VARCHAR(30) NOT NULL,
    `containerId` VARCHAR(30) NOT NULL,
    `origin` VARCHAR(100) NOT NULL,
    `destination` VARCHAR(100) NOT NULL,
    `estimatedDeliveryAt` DATETIME(3) NOT NULL,
    `actualDeliveryAt` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'BOOKED', 'IN_TRANSIT', 'DELIVERED') NOT NULL DEFAULT 'DRAFT',
    `notes` VARCHAR(1000) NULL,
    `createdById` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Shipment_shipmentNumber_key`(`shipmentNumber`),
    INDEX `Shipment_status_estimatedDeliveryAt_idx`(`status`, `estimatedDeliveryAt`),
    INDEX `Shipment_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `Shipment_containerId_status_idx`(`containerId`, `status`),
    INDEX `Shipment_createdAt_idx`(`createdAt`),
    INDEX `Shipment_estimatedDeliveryAt_idx`(`estimatedDeliveryAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShipmentEvent` (
    `id` VARCHAR(30) NOT NULL,
    `shipmentId` VARCHAR(30) NOT NULL,
    `previousStatus` ENUM('DRAFT', 'BOOKED', 'IN_TRANSIT', 'DELIVERED') NULL,
    `newStatus` ENUM('DRAFT', 'BOOKED', 'IN_TRANSIT', 'DELIVERED') NOT NULL,
    `changedById` VARCHAR(30) NOT NULL,
    `remarks` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ShipmentEvent_shipmentId_createdAt_idx`(`shipmentId`, `createdAt`),
    INDEX `ShipmentEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(30) NOT NULL,
    `actorId` VARCHAR(30) NOT NULL,
    `entityType` ENUM('SHIPMENT', 'CUSTOMER', 'CONTAINER') NOT NULL,
    `entityId` VARCHAR(30) NOT NULL,
    `action` ENUM('CREATE', 'UPDATE', 'STATUS_CHANGE') NOT NULL,
    `beforeData` JSON NULL,
    `afterData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
    INDEX `AuditLog_actorId_idx`(`actorId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SequenceCounter` (
    `name` VARCHAR(50) NOT NULL,
    `value` INTEGER NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_containerId_fkey` FOREIGN KEY (`containerId`) REFERENCES `Container`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShipmentEvent` ADD CONSTRAINT `ShipmentEvent_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `Shipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShipmentEvent` ADD CONSTRAINT `ShipmentEvent_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
