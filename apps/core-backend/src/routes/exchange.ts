import express from 'express';
import { BACKEND_ID, client, riskEngineclient, leverageClient, waitForResponse } from '..';
import { find_asset, find_market, get_balance } from '../middleware/exchange';
import { Prisma, prisma } from 'database';
import { scaledDecimal, toPriceUnits, toQuantityUnits } from 'shared-types';
import { Order } from '../types/user';
import { ZodError } from 'zod';
import { binanceDepth, binanceTrades } from '../utils/binance';

if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is not set');
}

const router = express();
const DEPTH_RESPONSE_TIMEOUT_MS = Number(process.env.DEPTH_RESPONSE_TIMEOUT_MS || 1200);

// Request-path logging is off unless VERBOSE_LOGGING is enabled (ENGINE_CONTRACT.md §6).
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true';
const log = (...args: unknown[]) => {
    if (VERBOSE_LOGGING) console.log(...args);
};

async function getBestPrice(symbol: string, side: 'buy' | 'sell'): Promise<number | null> {
    try {
        const request_id = crypto.randomUUID();
        const response_promise = waitForResponse(request_id, 8000);
        await client.lPush(
            `incoming-request`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload: symbol,
                command: 'get-depth',
            }),
        );

        const parsed = await response_promise;
        if (!parsed) return null;

        const asks: [number, number][] = parsed.asks || [];
        const bids: [number, number][] = parsed.bids || [];

        if (side === 'buy') {
            if (!asks.length) return null;
            let best = Number.POSITIVE_INFINITY;
            for (const [p] of asks) best = Math.min(best, Number(p));
            return Number.isFinite(best) ? best : null;
        } else {
            if (!bids.length) return null;
            let best = 0;
            for (const [p] of bids) best = Math.max(best, Number(p));
            return best > 0 ? best : null;
        }
    } catch (e) {
        return null;
    }
}

router.post('/api/exchange/spot/order', async (req, res) => {
    try {
        const req_body = req.body;
        const { type, side, quantity, price, symbol } = Order.parse(req_body);

        log({ symbol });
        const start_time = Date.now();

        const user_id = req.user;
        log({ user_id });

        const mkt = await find_market(symbol);

        log({ mkt });

        if (!mkt) {
            return res.status(404).json({ message: "Marekt not available" })
        }

        const asts = symbol.split(/_/);
        log({ asts });

        const base_ast = await find_asset(asts[0]);
        const quote_ast = await find_asset(asts[1]);
        if (!base_ast || !quote_ast) {
            return;
        }

        const base_bal = await get_balance(user_id, asts[0]);
        const quote_bal = await get_balance(user_id, asts[1]);

        log({ quote_bal, base_bal });

        if (!quote_bal || !base_bal) {
            return res.status(404).json({ message: "Not have valid wallet! Please fund you wallet" })
        }

        const user_quote_ast = await prisma.asset_balance.findFirst({
            where: {
                user_id: user_id,
                assetId: quote_ast.id
            }
        });

        let required_bal;
        if (type == 'limit') {
            required_bal = scaledDecimal(price * quantity, Number(quote_ast.decimals));
        } else {
            const best = await getBestPrice(symbol, side);
            if (!best) {
                return res.status(404).json({ message: 'No liquidity available for market order' });
            }
            required_bal = scaledDecimal(best * quantity, Number(quote_ast.decimals));
        }
        //for buy, check the currency balance, for sell check the asset balance
        //for buy lock the currency, for sell lock the asset

        log({ base_ast, quote_ast });

        const user_base_ast = await prisma.asset_balance.findFirst({
            where: {
                user_id: user_id,
                assetId: base_ast.id
            }
        });

        const required_bal_sell = scaledDecimal(quantity, Number(base_ast.decimals));


        if (side == 'buy' && Number(required_bal) > quote_bal.balance) {
            return res.status(404).json({ message: 'Insufficient wallet balance' });
        } else if (side == 'sell' && Number(required_bal_sell) > Number(base_bal.balance)) {
            return res.status(404).json({ message: 'Insufficient asset balance' });
        }

        if (side == 'buy') {
            await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: user_id,
                        assetId: quote_ast?.id
                    }
                },
                data: {
                    locked_balance: {
                        increment: required_bal
                    },
                    balance: {
                        decrement: required_bal
                    }
                }
            })
        } else {
            await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: user_id,
                        assetId: base_ast?.id
                    }
                },
                data: {
                    locked_balance: {
                        increment: required_bal_sell
                    },
                    balance: {
                        decrement: required_bal_sell
                    }
                }
            })
        }

        //sufficient balance then lock required balance

        //lock required assets before sending to matching engine

        const request_id = crypto.randomUUID();

        log({ request_id });


        // Every message sent from the backend to the engine includes:

        //correlationId
        //responseQueue
        //type
        //payload

        //The engine must reply to message.responseQueue and include the same correlationId.

        // Matching-engine contract (§1): integer base units. Price = whole
        // units; quantity = 18-decimal base units. Both serialize as strings.
        const payload_price = toPriceUnits(price || 0);
        const payload_quantity = toQuantityUnits(quantity);

        const payload: any = type == 'limit' ? { type, quantity: payload_quantity, price: payload_price, symbol, side, user_id } : { type, quantity: payload_quantity, symbol, side, user_id };


        const response_promise = waitForResponse(request_id, 15000);

        await client.lPush(
            `incoming-request`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload,
                command: 'create-order',
            }),
        );

        //  wait until we got request identifier
        //return filled quantity

        const parsed_res = await response_promise;

        if (!parsed_res) {
            return res.status(404).json({ message: "Order rejected! matching engine not processing orders", })
        }

        log({ parsed_res });

        const end_time = Date.now();

        // i have to lock asset here


        const res_time = end_time - start_time;
        res.json({ message: parsed_res.status, data: parsed_res, respnose_time: res_time });
    } catch (error) {
        log({ error });
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.post('/api/exchange/future/order', async (req, res) => {

    try {
        const req_body = req.body;
        const { type, side, quantity, price, symbol } = Order.parse(req_body);

        log({ symbol });
        const start_time = Date.now();

        const user_id = req.user;
        log({ user_id });

        const mkt = await find_market(symbol);

        log({ mkt });

        if (!mkt) {
            return res.status(404).json({ message: "Market not available" })
        }

        const asts = symbol.split(/_/);
        log({ asts });

        const base_ast = await find_asset(asts[0]);
        const quote_ast = await find_asset(asts[1]);
        if (!base_ast || !quote_ast) {
            return;
        }

        const base_bal = await get_balance(user_id, asts[0]);
        const quote_bal = await get_balance(user_id, asts[1]);

        if (!quote_bal || !base_bal) {
            return res.status(404).json({ message: "Not have valid wallet! Please fund you wallet" })
        }
        //for buy, check the currency balance, for sell check the asset balance
        //for buy lock the currency, for sell lock the asset


        log({ base_ast, quote_ast });

        //closing an existing perp position => opposing order reduces active position, no new margin locked
        const existing_position = await prisma.position.findFirst({
            where: {
                user_id: user_id,
                market_id: mkt.id
            }
        });

        log({ existing_position });

        const is_closing = existing_position && (
            (existing_position.side == 'long' && side == 'sell') ||
            (existing_position.side == 'short' && side == 'buy')
        );

        const command = is_closing ? 'close-position' : 'create-order';

        const request_id = crypto.randomUUID();

        log({ request_id });

        // Every message sent from the backend to the engine includes:

        //correlationId
        //responseQueue
        //type
        //payload

        //The engine must reply to message.responseQueue and include the same correlationId.

        const payload: any = { type, quantity, price, symbol, side, user_id };
        if (is_closing) {
            payload.position_id = existing_position.id;
            payload.initial_margin = existing_position.initial_margin;
        }

        const response_promise = waitForResponse(request_id, 10000);

        await riskEngineclient.lPush(
            `risk-engine-req-queue`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload,
                command,
            }),
        );

        //  wait until we got request identifier
        //return filled quantity

        const parsed_res = await response_promise;

        log({ parsed_res });

        res.json({ message: 'order placed', data: parsed_res });



    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get('/api/exchange/spot/order/:order_id', async (req, res) => {

    try {
        const order_id = req.params.order_id;
        const request_id = crypto.randomUUID();

        log({ order_id });

        const response_promise = waitForResponse(request_id, 10000);

        await client.lPush(
            `incoming-request`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload: order_id,
                command: 'get-order',
            }),
        );

        //  wait until we got request identifier
        //return filled quantity

        const parsed_res = await response_promise;

        if (!parsed_res) {
            return res.status(404).json({ message: 'Order not found' });
        }

        log({ parsed_res });

        res.json({ message: 'order fetched successfully', data: parsed_res });
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.delete('/api/exchange/spot/order/:order_id', async (req, res) => {

    try {
        const order_id = req.params.order_id;
        const request_id = crypto.randomUUID();

        log({ order_id });

        const response_promise = waitForResponse(request_id, 10000);

        await client.lPush(
            `incoming-request`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload: order_id,
                command: 'cancel-order',
            }),
        );

        //  wait until we got request identifier
        //return filled quantity

        const parsed_res = await response_promise;

        if (!parsed_res) {
            return res.status(404).json({ message: 'Order not found' });
        }

        log({ parsed_res });

        res.json({ message: parsed_res.status, data: parsed_res });
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});


router.get('/api/exchange/depth/:symbol', async (req, res) => {
    //sends get-depth to engine
    //aggregated orderbook {bids:[[price,size]...], asks:[[price,size]...], timestamp}
    try {
        const symbol = req.params.symbol;
        if (req.query.demo === 'true') {
            return res.json({ message: 'demo depth fetched successfully', data: await binanceDepth(symbol) });
        }
        const request_id = crypto.randomUUID();

        log({ symbol, request_id });

        const response_promise = waitForResponse(request_id, DEPTH_RESPONSE_TIMEOUT_MS);

        await client.lPush(
            `incoming-request`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload: symbol,
                command: 'get-depth',
            }),
        );

        const parsed_res = await response_promise;

        if (!parsed_res) {
            return res.json({ message: 'depth fetched successfully', data: { symbol, bids: [], asks: [], timestamp: Date.now() } });
        }

        log({ parsed_res });

        res.json({ message: 'depth fetched successfully', data: parsed_res });
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});


router.post('/api/exchange/leverage', async (req, res) => {
    //send leverage update command to risk engine
    //get the confirmation

    try {
        const req_body = req.body;

        const leverage = req_body.leverage;

        log({ leverage });

        const user_id = req.user;
        log({ user_id });

        const request_id = crypto.randomUUID();

        const response_promise = waitForResponse(request_id, 10000);

        await leverageClient.lPush(
            `leverage-req-queue`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload: { leverage, user_id },
                command: 'leverage-update',
            }),
        );
        const parsed_res = await response_promise;

        if (!parsed_res) {
            return res.status(404).json({ message: 'Leverage update not confirmed' });
        }

        log({ parsed_res });

        res.json({ message: parsed_res.status, data: parsed_res });
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get("/api/exchange/trades/:symbol", async (req, res) => {
    try {
        const symbol = req.params.symbol;
        const user = req.user;

        log({ symbol });

        if (req.query.demo === 'true') {
            return res.json({ message: "Trades fetched successfully", trades: await binanceTrades(symbol) });
        }

        const fills = await prisma.fill.findMany({
            where: {
                symbol: symbol,
            },
            orderBy: {
                created_at: 'desc',
            },
            take: 20
        });
        log({ fills });

        res.json({ message: "Trades fetched successfully", trades: fills })
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get("/api/exchange/orders{/:status}", async (req, res) => {
    //after order, db worker is not updating order table
    //user's order history (open, filled, cancelled)
    try {
        const user = req.user;
        const status = req.params.status;

        if (status && status != 'open' && status != 'filled' && status != 'cancelled' && status !== "partially filled") {
            return res.status(404).json({ message: "Invalid Order status" })
        }

        const orders = await prisma.order.findMany({
            where: {
                user_id: user
            }
        });

        log({ orders });

        const filtered_order = orders.filter(o => o.status == status);
        log({ filtered_order });

        res.json({ message: "Orders fetched successfully", orders: status ? filtered_order : orders })
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }

});

router.get("/api/exchange/fills", async (req, res) => {
    try {
        const user = req.user;

        const buy_fills = await prisma.fill.findMany({
            where: {
                buy_user_id: user,
            },
        });
        const sell_fills = await prisma.fill.findMany({
            where: {
                sell_user_id: user,
            },
        })

        res.json({ message: "Fill fetched successfully", fills: { buy_fills: buy_fills, sell_fills: sell_fills } })
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get("/api/exchange/positions", async (req, res) => {
    //current open perp positions for the user: symbol, side, size, entry_price, mark_price, uPnL, margin, leverage
    try {
        const user_id = req.user;

        const positions = await prisma.position.findMany({
            where: {
                user_id: user_id
            },
            include: {
                market: true
            }
        });

        log({ positions });

        const result = await Promise.all(positions.map(async (p) => {
            const asts = p.market.symbol.split(/_/);
            const ast = await find_asset(asts[0]);
            const last_price = await prisma.assetPrice.findFirst({
                where: {
                    assetId: ast?.id
                },
                orderBy: {
                    timestamp: 'desc'
                }
            });

            const mark_price = Number(last_price?.mark_price || 0);
            const entry_price = Number(p.entryPrice);
            const quantity = Number(p.quantity);

            const uPnL = p.side == 'long'
                ? (mark_price - entry_price) * quantity
                : (entry_price - mark_price) * quantity;

            return {
                id: p.id,
                symbol: p.market.symbol,
                side: p.side,
                size: p.quantity,
                entry_price: p.entryPrice,
                mark_price: mark_price,
                uPnL: uPnL,
                margin: p.initial_margin,
                leverage: p.leverage,
            };
        }));

        res.json({ message: "Positions fetched successfully", positions: result });
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get("/api/history/funding", async (req, res) => {
    //funding fee history for the user, persisted by db-worker settleFunding
    try {
        const user_id = req.user;

        const funding_fees = await prisma.fundingFee.findMany({
            where: {
                user_id: user_id
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        log({ funding_fees });

        res.json({ message: "Funding fee history fetched successfully", funding_fees });
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get("/api/history/liquidation", async (req, res) => {
    //liquidation events for the user, persisted by risk-engine liquidation.ts
    try {
        const user_id = req.user;

        const liquidations = await prisma.liquidation.findMany({
            where: {
                user_id: user_id
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        log({ liquidations });

        res.json({ message: "Liquidation history fetched successfully", liquidations });
    } catch (error) {
        log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

export default router;
