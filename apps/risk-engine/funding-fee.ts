
import { Decimal } from "database/generated/prisma/internal/prismaNamespace";
import { ASSETS, PRICES, SHARED_ORDERBOOK, BALANCES, LEVERAGES, SHARED_FILLS } from "./shared-state";
import { createClient } from "redis";

const client = createClient();
client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

client.connect();
console.log("redis client connected");

interface Market {
    market: string,
    best_bid: Decimal,
    best_ask: Decimal,
    perp_price: Decimal,
    index_price: Decimal,
    mark_price: Decimal,
    premimum_index: Decimal,
    funding_rate: number,
}


const clamp = (val: number, min: number, max: number) => {
    return val > max ? max : val < min ? min : val
};

const funding_fee_collector = async () => {
    const INTEREST_RATE = 0.5;

    const markets = SHARED_ORDERBOOK.entries();
    const market_prices: Market[] = [];

    markets.forEach((v, k) => {
        console.log({ v, k });
        const mkt = v[0];
        const book = v[1];
        console.log({ mkt, book });

        let lowest_price = new Decimal(0);
        let lowest_order: string = '';
        let highest_price = new Decimal(0);
        let highest_order: string = '';

        if (book.asks.size > 0) {
            for (const [key, value] of book.asks.entries()) {
                console.log({ key, value });
                if (value.price <= Number(lowest_price)) {
                    lowest_price = new Decimal(value.price);
                    lowest_order = key;
                }
            }
        }

        if (book.bids.size > 0) {
            for (const [key, value] of book.bids.entries()) {
                console.log({ key, value });
                if (value.price >= Number(highest_price)) {
                    highest_price = new Decimal(value.price);
                    highest_order = key;
                }
            }
        }
        console.log({ lowest_order });
        console.log({ lowest_price });

        console.log({ highest_order });
        console.log({ highest_price });

        const ast_price = PRICES.get(mkt);
        console.log({ ast_price });

        if (!ast_price) {
            return
        }

        const perp_price = (highest_price.plus(lowest_price).div(2));

        const premimum_index = (perp_price.minus(ast_price.index_price)).div(ast_price.index_price);

        console.log({ premimum_index });

        const funding_rate = Number(premimum_index) + clamp(INTEREST_RATE - Number(premimum_index), 0.5, 0.5);
        console.log({ funding_rate });

        market_prices.push({
            market: mkt,
            best_ask: lowest_price,
            best_bid: highest_price,
            perp_price: perp_price,
            index_price: ast_price?.index_price,
            mark_price: ast_price.mark_price,
            premimum_index: premimum_index,
            funding_rate: funding_rate
        })
    })

    console.log({ market_prices });

    SHARED_FILLS.map(async (fill) => {
        console.log({ fill });
        const mkt = market_prices.find(m => m.market == fill.symbol);
        console.log({ mkt });

        const postional_value = fill.quantity * Number(mkt?.mark_price);
        console.log({ postional_value });

        let funding_fee = Number(mkt?.funding_rate) * postional_value;
        console.log({ funding_fee });

        console.log("Funding fee command sent to db worker");
        const payload = {
            funding_fee,
            funding_rate: mkt?.funding_rate,
            fill
        }
        client.lPush("funding-to-db-queue", JSON.stringify(payload));
    })
}

export const funding_service = async () => {
    setInterval(() => {
        console.log("funding fee collector");
        console.log({ SHARED_ORDERBOOK, SHARED_FILLS, PRICES, BALANCES, ASSETS });

        funding_fee_collector()

    }, 1000);
}

