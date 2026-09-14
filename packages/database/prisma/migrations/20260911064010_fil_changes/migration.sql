/*
  Warnings:

  - You are about to drop the column `ask_orderId` on the `Fill` table. All the data in the column will be lost.
  - You are about to drop the column `bid_orderId` on the `Fill` table. All the data in the column will be lost.
  - Added the required column `ask_order_id` to the `Fill` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bid_order_id` to the `Fill` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Fill" DROP CONSTRAINT "Fill_ask_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Fill" DROP CONSTRAINT "Fill_bid_orderId_fkey";

-- AlterTable
ALTER TABLE "Fill" DROP COLUMN "ask_orderId",
DROP COLUMN "bid_orderId",
ADD COLUMN     "ask_order_id" INTEGER NOT NULL,
ADD COLUMN     "bid_order_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_ask_order_id_fkey" FOREIGN KEY ("ask_order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_bid_order_id_fkey" FOREIGN KEY ("bid_order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
