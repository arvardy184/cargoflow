-- Runs once when the MySQL volume is first initialised (development only).
-- Creates an isolated database for automated integration tests and grants the
-- application user the privileges Prisma Migrate needs (it creates a temporary
-- shadow database during `prisma migrate dev`).
CREATE DATABASE IF NOT EXISTS cargoflow_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON *.* TO 'cargoflow'@'%';
FLUSH PRIVILEGES;
