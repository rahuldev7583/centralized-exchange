/*
  Warnings:

  - Added the required column `type` to the `Market` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('Spot', 'Perp');

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "type" "MarketType" NOT NULL;
