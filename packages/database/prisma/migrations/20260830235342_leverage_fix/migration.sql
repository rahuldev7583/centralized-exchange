/*
  Warnings:

  - You are about to drop the column `userUser_id` on the `leverage` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[user_id]` on the table `leverage` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `user_id` to the `leverage` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "leverage" DROP CONSTRAINT "leverage_userUser_id_fkey";

-- AlterTable
ALTER TABLE "leverage" DROP COLUMN "userUser_id",
ADD COLUMN     "user_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "leverage_user_id_key" ON "leverage"("user_id");

-- AddForeignKey
ALTER TABLE "leverage" ADD CONSTRAINT "leverage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
