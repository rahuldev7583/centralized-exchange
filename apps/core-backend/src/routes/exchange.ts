import express from 'express';
import { BACKEND_ID, client, riskEngineclient, get_identifier, leverageClient } from '..';
import { find_asset, find_market, get_balance } from '../middleware/exchange';
import { prisma } from 'database';
import { scaledDecimal } from 'shared-types';
import { Order } from '../types/user';
import { ZodError } from 'zod';
import { createClient } from 'redis';
import { Prisma, } from '../../generated/prisma/client';

const router = express();

const spotClient = createClient();
spotClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

spotClient.connect();
console.log('spotClient Connected');

const perpClient = createClient();
perpClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);
perpClient.connect();
console.log('perpClient Connected');

router.post('/api/exchange/spot/order', async (req, res) => {
    try {
        const req_body = req.body;
        const { type, side, quantity, price, symbol } = Order.parse(req_body);

        console.log({ symbol });
        const start_time = Date.now();

        const user_id = req.user;
        console.log({ user_id });

        const mkt = await find_market(symbol);

        console.log({ mkt });

        if (!mkt) {
            return res.status(404).json({ message: "Marekt not available" })
        }

        const asts = symbol.split(/_/);
        console.log({ asts });

        const base_ast = await find_asset(asts[0]);
        const quote_ast = await find_asset(asts[1]);
        if (!base_ast || !quote_ast) {
            return;
        }

        const base_bal = await get_balance(user_id, asts[0]);
        const quote_bal = await get_balance(user_id, asts[1]);

        console.log({ quote_bal, base_bal });

        if (!quote_bal || !base_bal) {
            return res.status(404).json({ message: "Not have valid wallet! Please fund you wallet" })
        }

        const user_quote_ast = await prisma.asset_balance.findFirst({
            where: {
                user_id: user_id,
                assetId: quote_ast.id
            }
        });

        const required_bal = type == "limit" ? scaledDecimal(price * quantity, Number(quote_ast.decimals)) : user_quote_ast?.balance;
        //for buy, check the currency balance, for sell check the asset balance
        //for buy lock the currency, for sell lock the asset

        console.log({ base_ast, quote_ast });

        const user_base_ast = await prisma.asset_balance.findFirst({
            where: {
                user_id: user_id,
                assetId: base_ast.id
            }
        });

        const required_bal_sell = type == 'limit' ? scaledDecimal(quantity, Number(base_ast.decimals)) : user_base_ast?.balance;


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

        console.log({ request_id });


        // Every message sent from the backend to the engine includes:

        //correlationId
        //responseQueue
        //type
        //payload

        //The engine must reply to message.responseQueue and include the same correlationId.

        const payload_price = new Prisma.Decimal(price || 0);
        const payload_quantity = new Prisma.Decimal(quantity);

        const payload: any = type == 'limit' ? { type, quantity: payload_quantity, price: payload_price, symbol, side, user_id } : { type, quantity: payload_quantity, symbol, side, user_id };


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

        const res_data = await spotClient.brPop(`response-queue-${BACKEND_ID}`, 0);
        console.log({ res_data });

        if (!res_data) {
            return res.status(404).json({ message: "Order rejected! matching engine not processing orders", })
        }

        const parsed_res = JSON.parse(res_data?.element);

        console.log({ parsed_res });

        const end_time = Date.now();

        // i have to lock asset here


        const res_time = end_time - start_time;
        res.json({ message: parsed_res.status, data: parsed_res, respnose_time: res_time });
    } catch (error) {
        console.log({ error });
        console.log({ error });
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

        console.log({ symbol });
        const start_time = Date.now();

        const user_id = req.user;
        console.log({ user_id });

        const mkt = await find_market(symbol);

        console.log({ mkt });

        if (!mkt) {
            return res.status(404).json({ message: "Market not available" })
        }

        const asts = symbol.split(/_/);
        console.log({ asts });

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


        console.log({ base_ast, quote_ast });

        //closing an existing perp position => opposing order reduces active position, no new margin locked
        const existing_position = await prisma.position.findFirst({
            where: {
                user_id: user_id,
                market_id: mkt.id
            }
        });

        console.log({ existing_position });

        const is_closing = existing_position && (
            (existing_position.side == 'long' && side == 'sell') ||
            (existing_position.side == 'short' && side == 'buy')
        );

        const command = is_closing ? 'close-position' : 'create-order';

        const request_id = crypto.randomUUID();

        console.log({ request_id });

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

        //const res_data: any = await get_identifier('response-queue', true);

        console.log({
            url: `response-queue-perp-${BACKEND_ID}`
        });

        const res_data = await spotClient.brPop(`response-queue-${BACKEND_ID}`, 4);
        console.log({ res_data });
        const parsed_res = res_data && JSON.parse(res_data?.element);

        const risk_res_data = await perpClient.brPop(`response-queue-perp-${BACKEND_ID}`, 4);

        console.log({ risk_res_data });

        const parsed_risk_res = risk_res_data && JSON.parse(risk_res_data?.element);

        console.log({ parsed_risk_res });

        if (res_data) {
            res.json({ message: 'order placed', data: parsed_res });
        } else {
            res.json({ message: 'order placed', data: parsed_risk_res });
        }



    } catch (error) {
        console.log({ error });
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

        console.log({ order_id });

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

        const res_data: any = await get_identifier('response-queue');

        console.log({ res_data });

        const parsed_res = JSON.parse(res_data?.element);

        console.log({ parsed_res });

        res.json({ message: 'order fetched successfully', data: parsed_res });
    } catch (error) {
        console.log({ error });
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

        console.log({ order_id });

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

        const res_data: any = await get_identifier('response-queue');

        console.log({ res_data });

        const parsed_res = JSON.parse(res_data?.element);

        console.log({ parsed_res });

        res.json({ message: parsed_res.status, data: parsed_res });
    } catch (error) {
        console.log({ error });
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
        const request_id = crypto.randomUUID();

        console.log({ symbol, request_id });

        await client.lPush(
            `incoming-request`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload: symbol,
                command: 'get-depth',
            }),
        );

        const res_data: any = await get_identifier('response-queue', true);

        console.log({ res_data });

        const parsed_res = JSON.parse(res_data?.element);

        console.log({ parsed_res });

        res.json({ message: 'depth fetched successfully', data: parsed_res });
    } catch (error) {
        console.log({ error });
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

        console.log({ leverage });

        const user_id = req.user;
        console.log({ user_id });

        const request_id = crypto.randomUUID();

        await leverageClient.lPush(
            `leverage-req-queue`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload: { leverage, user_id },
                command: 'leverage-update',
            }),
        );
        const res_data: any = await get_identifier('leverage-res-queue', false);

        console.log({ res_data });

        const parsed_res = JSON.parse(res_data?.element);

        console.log({ parsed_res });

        res.json({ message: parsed_res.status, data: parsed_res });
    } catch (error) {
        console.log({ error });
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

        console.log({ symbol });

        const fills = await prisma.fill.findMany({
            where: {
                symbol: symbol,
            },
            take: 20
        });
        console.log({ fills });

        res.json({ message: "Trades fetched successfully", trades: fills })
    } catch (error) {
        console.log({ error });
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

        console.log({ orders });

        const filtered_order = orders.filter(o => o.status == status);
        console.log({ filtered_order });

        res.json({ message: "Orders fetched successfully", orders: status ? filtered_order : orders })
    } catch (error) {
        console.log({ error });
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
        console.log({ error });
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

        console.log({ positions });

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
        console.log({ error });
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

        console.log({ funding_fees });

        res.json({ message: "Funding fee history fetched successfully", funding_fees });
    } catch (error) {
        console.log({ error });
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

        console.log({ liquidations });

        res.json({ message: "Liquidation history fetched successfully", liquidations });
    } catch (error) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

export default router;
