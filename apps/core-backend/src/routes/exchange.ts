import express from 'express';
import { BACKEND_ID, client, riskEngineclient, get_identifier, leverageClient } from '..';
import { find_asset, find_market, get_balance } from '../middleware/exchange';
import { prisma, Prisma } from 'database';
import { scaledDecimal } from 'shared-types';
import { Order } from '../types/user';
import { ZodError } from 'zod';
import { createClient } from 'redis';

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
    //todo
    // if user has wallet balance than than value they wanted to buy then throw error

    //  if user has asset quantity less than they wanted to sell , then throw error

    //if asset is not available on orderbook throw error

    // //  publish to queue
    //  wait until we got request identifier
    //return filled quantity

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

        const required_bal = await scaledDecimal(price * quantity, Number(quote_ast.decimals));
        //for buy, check the currency balance, for sell check the asset balance
        //for buy lock the currency, for sell lock the asset


        console.log({ base_ast, quote_ast });
        console.log({ required_bal });

        const required_bal_sell = side == 'sell' ? await scaledDecimal(quantity, Number(base_ast.decimals)) : 0;


        if (side == 'buy' && Number(required_bal) >= (quote_bal.balance - quote_bal.locked_balance)) {
            return res.status(404).json({ message: 'Insufficient wallet balance' });
        } else if (side == 'sell' && Number(required_bal_sell) >= Number(base_bal.balance) - Number(base_bal.locked_balance)) {
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

        const payload_price = new Prisma.Decimal(price);
        const payload_quantity = new Prisma.Decimal(quantity);

        const payload: any = { type, quantity: payload_quantity, price: payload_price, symbol, side, user_id };


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
    //todo
    // if user has wallet balance than than value they wanted to buy then throw error

    //  if user has asset quantity less than they wanted to sell , then throw error

    //if asset is not available on orderbook throw error

    // //  publish to queue
    //  wait until we got request identifier
    //return filled quantity

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

        if (!quote_bal || !base_bal) {
            return res.status(404).json({ message: "Not have valid wallet! Please fund you wallet" })
        }
        //for buy, check the currency balance, for sell check the asset balance
        //for buy lock the currency, for sell lock the asset


        console.log({ base_ast, quote_ast });

        const request_id = crypto.randomUUID();

        console.log({ request_id });

        // Every message sent from the backend to the engine includes:

        //correlationId
        //responseQueue
        //type
        //payload

        //The engine must reply to message.responseQueue and include the same correlationId.

        const payload: any = { type, quantity, price, symbol, side, user_id };

        await riskEngineclient.lPush(
            `risk-engine-req-queue`,
            JSON.stringify({
                BACKEND_ID,
                request_id,
                payload,
                command: 'create-order',
            }),
        );

        //  wait until we got request identifier
        //return filled quantity

        //const res_data: any = await get_identifier('response-queue', true);

        console.log({
            url: `response-queue-${BACKEND_ID}`
        });
        const res_data = await perpClient.brPop(`response-queue-perp-${BACKEND_ID}`, 2);

        console.log({ res_data });

        const parsed_res = JSON.parse(res_data?.element);

        console.log({ parsed_res });

        res.json({ message: 'order placed', data: parsed_res });

    } catch (error) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get('/api/exchange/spot/order/:order_id', async (req, res) => {
    //todo
    //  sends get-order

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
});

router.get('/api/exchange/spot/order/open', (req, res) => {
    //todo
});

router.delete('/api/exchange/spot/order/:order_id', async (req, res) => {
    //  todo
    //  sends cancel-order

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
});


router.get('/api/exchange/depth/:symbol', (req, res) => {
    //todo
    //sends get-depth to engine
});


router.post('/api/exchange/leverage', async (req, res) => {
    //send leverage update command to risk engine
    //get the confirmation

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
})

export default router;
