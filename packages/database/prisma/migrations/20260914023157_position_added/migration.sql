-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "market_id" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DECIMAL(78,0) NOT NULL,
    "entryPrice" DECIMAL(78,0) NOT NULL,
    "leverage" INTEGER NOT NULL,
    "initial_margin" DECIMAL(78,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_id_key" ON "Position"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Position_user_id_market_id_key" ON "Position"("user_id", "market_id");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
