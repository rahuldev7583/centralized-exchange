import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SYMBOL = process.env.DEMO_SYMBOL || firstLocalSymbol(process.env.MM_SYMBOLS);
const MINUTES = Number(process.env.DEMO_MINUTES || 10);
const FILLS = Number(process.env.DEMO_FILLS || 180);
const BASE_PRICE = process.env.DEMO_BASE_PRICE ? Number(process.env.DEMO_BASE_PRICE) : undefined;
const BASE_QTY = Number(process.env.DEMO_QTY || 0.002);
const MAKER_USERNAME = process.env.DEMO_MAKER_USERNAME || "demo_mm_maker";
const TAKER_USERNAME = process.env.DEMO_TAKER_USERNAME || "demo_mm_taker";

if (MINUTES <= 0) throw new Error("DEMO_MINUTES must be > 0");
if (FILLS <= 0) throw new Error("DEMO_FILLS must be > 0");
if (BASE_QTY <= 0) throw new Error("DEMO_QTY must be > 0");

function firstLocalSymbol(raw?: string) {
    return raw?.split(",")[0]?.split(":")[0];
}

function randomBetween(min: number, max: number) {
    return min + Math.random() * (max - min);
}

function quantityString(value: number) {
    return Math.max(value, 0.0000001).toFixed(8);
}

function priceString(value: number) {
    return String(Math.max(1, Math.round(value)));
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
    const market = SYMBOL
        ? await prisma.market.findUnique({ where: { symbol: SYMBOL }, include: { base_asset: true } })
        : await prisma.market.findFirst({ orderBy: { id: "asc" }, include: { base_asset: true } });

    if (!market) {
        throw new Error(
            SYMBOL
                ? `Market ${SYMBOL} was not found`
                : "No market was found. Create a market first or set DEMO_SYMBOL.",
        );
    }

    const maker = await findOrCreateUser(MAKER_USERNAME);
    const taker = await findOrCreateUser(TAKER_USERNAME);

    const latestFill = await prisma.fill.findFirst({
        where: { symbol: market.symbol },
        orderBy: { created_at: "desc" },
    });

    const anchorPrice = BASE_PRICE || Number(latestFill?.price || market.base_asset.last_traded_price || 100000);
    const now = Date.now();
    const start = now - MINUTES * 60_000;
    const spacing = Math.max(1, Math.floor((MINUTES * 60_000) / FILLS));

    const orders: Array<any> = [];
    const fills: Array<any> = [];
    let price = anchorPrice;

    for (let i = 0; i < FILLS; i++) {
        const progress = i / Math.max(1, FILLS - 1);
        const wave = Math.sin(progress * Math.PI * 5) * anchorPrice * 0.0018;
        const drift = (progress - 0.5) * anchorPrice * 0.0012;
        const noise = randomBetween(-anchorPrice * 0.00045, anchorPrice * 0.00045);
        price = Math.max(1, price * 0.72 + (anchorPrice + wave + drift + noise) * 0.28);

        const qty = quantityString(BASE_QTY * randomBetween(0.45, 2.4));
        const createdAt = new Date(start + i * spacing + randomBetween(0, spacing * 0.7));
        const bidOrderId = crypto.randomUUID();
        const askOrderId = crypto.randomUUID();
        const sideFlip = i % 2 === 0;

        orders.push(
            {
                id: bidOrderId,
                type: "limit",
                price: priceString(price - randomBetween(1, 5)),
                quantity: qty,
                filled: qty,
                status: "filled",
                side: "buy",
                market_id: market.id,
                user_id: sideFlip ? taker.user_id : maker.user_id,
                entry_price: priceString(price),
                initial_margin: "0",
                created_at: createdAt,
                updated_at: createdAt,
            },
            {
                id: askOrderId,
                type: "limit",
                price: priceString(price + randomBetween(1, 5)),
                quantity: qty,
                filled: qty,
                status: "filled",
                side: "sell",
                market_id: market.id,
                user_id: sideFlip ? maker.user_id : taker.user_id,
                entry_price: priceString(price),
                initial_margin: "0",
                created_at: createdAt,
                updated_at: createdAt,
            },
        );

        fills.push({
            id: crypto.randomUUID(),
            type: "limit",
            price: priceString(price),
            quantity: qty,
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

    await prisma.$transaction([
        prisma.order.createMany({ data: orders }),
        prisma.fill.createMany({ data: fills }),
        prisma.asset.update({
            where: { id: market.base_asset_id },
            data: { last_traded_price: priceString(price) },
        }),
    ]);

    console.log(
        `Generated ${fills.length} demo fills for ${market.symbol} across ${MINUTES} minutes ` +
        `(${new Date(start).toISOString()} - ${new Date(now).toISOString()}).`,
    );
    console.log(`Last demo price: ${priceString(price)}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
