/*
  Warnings:

  - You are about to drop the column `marketId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `userUser_id` on the `Order` table. All the data in the column will be lost.
  - Added the required column `buy_user_id` to the `Fill` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sell_user_id` to the `Fill` table without a default value. This is not possible if the table is not empty.
  - Added the required column `symbol` to the `Fill` table without a default value. This is not possible if the table is not empty.
  - Added the required column `market_id` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_marketId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userUser_id_fkey";

-- AlterTable
ALTER TABLE "Fill" ADD COLUMN     "buy_user_id" INTEGER NOT NULL,
ADD COLUMN     "sell_user_id" INTEGER NOT NULL,
ADD COLUMN     "symbol" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "marketId",
DROP COLUMN "userUser_id",
ADD COLUMN     "market_id" INTEGER NOT NULL,
ADD COLUMN     "user_id" INTEGER NOT NULL,
ALTER COLUMN "initial_margin" SET DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_sell_user_id_fkey" FOREIGN KEY ("sell_user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_buy_user_id_fkey" FOREIGN KEY ("buy_user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
