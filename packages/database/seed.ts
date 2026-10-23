import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error(
        "DATABASE_URL is not set",
    );
}

const adapter = new PrismaPg({
    connectionString: DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const DEMO_ASSETS = [
    { name: "Bitcoin", symbol: "BTC", decimals: 8n, last_traded_price: "65000" },
    { name: "Ethereum", symbol: "ETH", decimals: 8n, last_traded_price: "3500" },
    { name: "Solana", symbol: "SOL", decimals: 8n, last_traded_price: "150" },
    { name: "USD Coin", symbol: "USDC", decimals: 2n, last_traded_price: "1" },
];

const DEMO_MARKETS = [
    { base: "BTC", quote: "USDC", symbol: "BTC_USDC", name: "BTC/USDC", type: "Spot" as const, price: 65000, qty: 0.002 },
    { base: "ETH", quote: "USDC", symbol: "ETH_USDC", name: "ETH/USDC", type: "Spot" as const, price: 3500, qty: 0.04 },
    { base: "SOL", quote: "USDC", symbol: "SOL_USDC", name: "SOL/USDC", type: "Spot" as const, price: 150, qty: 1.2 },
    { base: "BTC", quote: "USDC", symbol: "BTC_USDC_PERP", name: "BTC/USDC Perp", type: "Perp" as const, price: 65050, qty: 0.002 },
    { base: "ETH", quote: "USDC", symbol: "ETH_USDC_PERP", name: "ETH/USDC Perp", type: "Perp" as const, price: 3503, qty: 0.04 },
    { base: "SOL", quote: "USDC", symbol: "SOL_USDC_PERP", name: "SOL/USDC Perp", type: "Perp" as const, price: 150.2, qty: 1.2 },
];

function priceString(value: number) {
    return String(Math.max(1, Math.round(value)));
}

function quantityString(value: number) {
    return Math.max(value, 0.00000001).toFixed(8);
}

async function findOrCreateUser(username: string) {
    const existing = await prisma.user.findFirst({ where: { username } });
    if (existing) return existing;

    return prisma.user.create({
        data: {
            username,
            email: `${username}@example.local`,
            password: "demo-password",
        },
    });
}

async function main() {
    for (const asset of DEMO_ASSETS) {
        await prisma.asset.upsert({
            where: { symbol: asset.symbol },
            create: asset,
            update: {
                name: asset.name,
                decimals: asset.decimals,
                last_traded_price: asset.last_traded_price,
            },
        });
    }

    const assets = await prisma.asset.findMany();
    const assetBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));

    for (const market of DEMO_MARKETS) {
        const base = assetBySymbol.get(market.base);
        const quote = assetBySymbol.get(market.quote);
        if (!base || !quote) continue;

        await prisma.market.upsert({
            where: { symbol: market.symbol },
            create: {
                name: market.name,
                symbol: market.symbol,
                type: market.type,
                base_asset_id: base.id,
                quote_asset_id: quote.id,
            },
            update: {
                name: market.name,
                type: market.type,
                base_asset_id: base.id,
                quote_asset_id: quote.id,
            },
        });
    }

    const maker = await findOrCreateUser("demo_mm_maker");
    const taker = await findOrCreateUser("demo_mm_taker");
    const seededMarkets = await prisma.market.findMany({
        where: { symbol: { in: DEMO_MARKETS.map((market) => market.symbol) } },
    });
    const marketConfig = new Map(DEMO_MARKETS.map((market) => [market.symbol, market]));

    const orders: Array<any> = [];
    const fills: Array<any> = [];
    const now = Date.now();

    for (const market of seededMarkets) {
        const config = marketConfig.get(market.symbol);
        if (!config) continue;

        for (let i = 0; i < 20; i++) {
            const createdAt = new Date(now - (i + 1) * 18_000);
            const wave = Math.sin(i * 0.8) * config.price * 0.0015;
            const price = priceString(config.price + wave);
            const quantity = quantityString(config.qty * (0.7 + (i % 5) * 0.18));
            const bidOrderId = `demo-${market.symbol}-bid-${i}`;
            const askOrderId = `demo-${market.symbol}-ask-${i}`;
            const sideFlip = i % 2 === 0;

            orders.push(
                {
                    id: bidOrderId,
                    type: "limit",
                    price,
                    quantity,
                    filled: quantity,
                    status: "filled",
                    side: "buy",
                    market_id: market.id,
                    user_id: sideFlip ? taker.user_id : maker.user_id,
                    entry_price: price,
                    initial_margin: "0",
                    created_at: createdAt,
                    updated_at: createdAt,
                },
                {
                    id: askOrderId,
                    type: "limit",
                    price,
                    quantity,
                    filled: quantity,
                    status: "filled",
                    side: "sell",
                    market_id: market.id,
                    user_id: sideFlip ? maker.user_id : taker.user_id,
                    entry_price: price,
                    initial_margin: "0",
                    created_at: createdAt,
                    updated_at: createdAt,
                },
            );

            fills.push({
                id: `demo-${market.symbol}-fill-${i}`,
                type: "limit",
                price,
                quantity,
                symbol: market.symbol,
                status: "filled",
                ask_order_id: askOrderId,
                bid_order_id: bidOrderId,
                sell_user_id: sideFlip ? maker.user_id : taker.user_id,
                buy_user_id: sideFlip ? taker.user_id : maker.user_id,
                created_at: createdAt,
                updated_at: createdAt,
            });
        }
    }

    await prisma.order.createMany({ data: orders, skipDuplicates: true });
    await prisma.fill.createMany({ data: fills, skipDuplicates: true });

    console.log("Seed complete.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
