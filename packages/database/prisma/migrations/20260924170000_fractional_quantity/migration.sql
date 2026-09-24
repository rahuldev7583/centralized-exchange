-- Fractional quantities (e.g. BTC trade size 0.002) must be stored exactly.
-- Previously Int / Decimal(78,0) silently truncated 0.002 to 0, so fills,
-- orders, positions and liquidations recorded zero sizes and the chart
-- (built from fills) could never show real volumes.
ALTER TABLE "Order" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(78,18);
ALTER TABLE "Order" ALTER COLUMN "filled" SET DATA TYPE DECIMAL(78,18);
ALTER TABLE "Fill" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(78,18);
ALTER TABLE "Position" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(78,18);
ALTER TABLE "Liquidation" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(78,18);