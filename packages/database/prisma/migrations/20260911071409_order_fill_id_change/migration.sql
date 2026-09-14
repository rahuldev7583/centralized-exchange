/*
  Warnings:

  - The primary key for the `Fill` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Order` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "Fill" DROP CONSTRAINT "Fill_ask_order_id_fkey";

-- DropForeignKey
ALTER TABLE "Fill" DROP CONSTRAINT "Fill_bid_order_id_fkey";

-- AlterTable
ALTER TABLE "Fill" DROP CONSTRAINT "Fill_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "ask_order_id" SET DATA TYPE TEXT,
ALTER COLUMN "bid_order_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Fill_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Fill_id_seq";

-- AlterTable
ALTER TABLE "Order" DROP CONSTRAINT "Order_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Order_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Order_id_seq";

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_ask_order_id_fkey" FOREIGN KEY ("ask_order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_bid_order_id_fkey" FOREIGN KEY ("bid_order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
