-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "decimals" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "entry_price" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "initial_margin" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "leverage" (
    "id" SERIAL NOT NULL,
    "limit" INTEGER NOT NULL,
    "userUser_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPrice" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assetId" INTEGER,

    CONSTRAINT "AssetPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetPrice_assetId_timestamp_key" ON "AssetPrice"("assetId", "timestamp");

-- AddForeignKey
ALTER TABLE "leverage" ADD CONSTRAINT "leverage_userUser_id_fkey" FOREIGN KEY ("userUser_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPrice" ADD CONSTRAINT "AssetPrice_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
