import { FILLS, scaledDecimal } from "shared-types";
import { createClient } from "redis";
import { type Fill, type Orderbook } from "shared-types";
import type { engineStatus } from "./risk-check";
import { prisma } from "database";
import type { Decimal } from "database/generated/prisma/internal/prismaNamespace";

export let LEVERAGES: any = [];
export let BALANCES: any = [];
export let ASSETS: any = [];

export let PRICES = new Map<string, {
    index_price: Decimal,
    mark_price: Decimal
}>();

export const SHARED_ORDERBOOK = new Map<string, Orderbook>();
export const SHARED_FILLS: Fill[] = [];

const STREAM_NAME = 'index-prices:events';
const GROUP_NAME = 'index-prices-processors';
const CONSUMER_NAME = `worker-${process.pid}`;

const client = createClient();
client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const matchingClient = createClient();
matchingClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

// stream => index-prices:events => client => to get the index from oracle stream

// stream => book-and-prices:events => publishClient => to publish orderbook and index n mark price, to listen to risk engine, liquidation and funding fee

//TODO
//1. get the index price from oracle
//2. get all open positions and  the asset last traded price to calculate mark price from mathcing engine orderbook and fills


const initializeStreamAndGroup = async () => {

    try {
        await client.xGroupCreate(STREAM_NAME, GROUP_NAME, '0', { MKSTREAM: true });
        console.log(`[Setup] Consumer group '${GROUP_NAME}' created.`);
    } catch (err) {

        if (err.message.includes('BUSYGROUP')) {
            //console.log(`[Setup] Consumer group '${GROUP_NAME}' already exists. Proceeding...`);
        } else {
            throw err;
        }
    }
}

const getIndexPrice = async () => {
    const response = await client.xReadGroup(
        GROUP_NAME,
        CONSUMER_NAME,
        { key: STREAM_NAME, id: '>' },
        { COUNT: 1, BLOCK: 5000 }
    );

    if (!response || response.length === 0) return;

    const [{ messages }] = response;
    console.log({ messages });

    const { id, message } = messages[0];

    const ast = ASSETS.find(a => a.symbol == message.symbol);

    const index_price = scaledDecimal(message.price, ast.decimals);

    const last_traded_price = ast.last_traded_price;

    const mark_price = last_traded_price != 0 ? index_price.plus(last_traded_price).div(2) : index_price

    console.log({ index_price, last_traded_price, mark_price });

    PRICES.set(message.symbol, {
        index_price: index_price,
        mark_price: mark_price
    })

    await client.xAck(STREAM_NAME, GROUP_NAME, id);
    console.log(`[Consumer] Acknowledged message ${id}`);

    return;
}

let price_stream: engineStatus = 'down'

export const shared_service = async () => {
    console.log("Shared Service");

    await Promise.all([
        client.connect(),
        matchingClient.connect()
    ])
    console.log("All redis client connected successfully");

    while (1) {
        //get the index price from oracle stream
        //get the asset last traded price from matching engine stream
        //publish to price stream for risk check, liquidation and funding fee

        if (price_stream == 'down') {
            price_stream = 'pending'
        }

        if (price_stream != 'ready') {

            await initializeStreamAndGroup()

            const markets = await prisma.market.findMany();

            console.log({ markets });
            if (!markets) {
                //error market not intitialized

            }

            for (let i = 0; i < markets.length; i++) {

                SHARED_ORDERBOOK.set(markets[i]?.symbol || 'Undefined', {
                    asks: new Map(),
                    bids: new Map()
                })
            }

            BALANCES = await prisma.asset_balance.findMany();
            console.log({ BALANCES });

            LEVERAGES = await prisma.leverage.findMany();
            console.log({ LEVERAGES });

            ASSETS = await prisma.asset.findMany();
            console.log({ ASSETS });

            price_stream = 'ready'
        }

        if (price_stream == 'ready') {
            await getIndexPrice();
        }

        const incoming_req = await matchingClient.brPop("matching-to-risk-pub-queue", 2);

        console.log({ incoming_req });

        const parsed_req = incoming_req && JSON.parse(incoming_req.element);
        console.log({ parsed_req });

        //matching engine will send order add, order cancel, order fill command, risk will update local orderbook and fills, on each fill, decrase the that order id quantity, if zero then remove from order book


        //problem is there will multiple orderbook as per markets
        if (parsed_req) {
            if (parsed_req.command == "create-order") {
                //push to orderbook
                const order = parsed_req.order;
                console.log({ order });

                const market = SHARED_ORDERBOOK.get(order.symbol);

                if (market) {
                    if (order.side == "buy") {
                        market.bids.set(order.order_id, order);
                    } else if (order.side == "sell") {
                        market.asks.set(order.order_id, order);
                    }

                }
            } else if (parsed_req.command == "fill-order") {
                //push to fill, decrease order quantitty from orderbook
                const fill = parsed_req.fill;

                console.log({ fill });
                FILLS.push(fill);

                const market = SHARED_ORDERBOOK.get(fill.symbol);
                if (market) {
                    if (fill.order_type == "buy") {
                        //decrease quan from ask
                        const order = market.asks.get(fill.sell_order_id);
                        console.log({ order });

                        if (order) {
                            market.asks.set(order?.order_id, { ...order, quantity: order?.quantity - fill.filled_quantity })

                            if (order.quantity == 0) {
                                market.asks.delete(order.order_id)
                            }
                        }

                    } else if (fill.order_type == 'sell') {
                        //decrease quan from buy
                        const order = market.bids.get(fill.buy_order_id);
                        console.log({ order });

                        if (order) {
                            market.bids.set(order?.order_id, { ...order, quantity: order?.quantity - fill.filled_quantity })

                            if (order.quantity == 0) {
                                market.bids.delete(order.order_id)
                            }
                        }
                    }

                }

            } else if (parsed_req.command == "cancel-order") {
                //remove from orderbook
                const order = parsed_req.order;
                console.log({ order });

                const market = SHARED_ORDERBOOK.get(order.symbol);

                if (market) {
                    if (order.side == "buy") {
                        market.bids.delete(order.order_id);
                    } else if (order.side == "sell") {
                        market.asks.delete(order.order_id);
                    }
                }
            }
        }

    }

}

