/*
  Warnings:

  - You are about to drop the column `price` on the `AssetPrice` table. All the data in the column will be lost.
  - Added the required column `index_price` to the `AssetPrice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mark_price` to the `AssetPrice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "last_traded_price" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "AssetPrice" DROP COLUMN "price",
ADD COLUMN     "index_price" BIGINT NOT NULL,
ADD COLUMN     "mark_price" BIGINT NOT NULL;
