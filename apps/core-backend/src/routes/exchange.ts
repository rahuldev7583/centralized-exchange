import express from 'express';
import { BACKEND_ID, client, get_identifier } from '..';
import { find_asset, find_market, get_balance } from '../middleware/exchange';
import { prisma } from 'database';

const router = express();

router.post('/api/exchange/spot/order', async (req, res) => {
    //todo
    // if user has wallet balance than than value they wanted to buy then throw error

    //  if user has asset quantity less than they wanted to sell , then throw error

    //if asset is not available on orderbook throw error

    // //  publish to queue
    //  wait until we got request identifier
    //return filled quantity

    const { type, side, quantity, price, symbol } = req.body;

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

    const required_bal = price * quantity;
    //for buy, check the currency balance, for sell check the asset balance
    //for buy lock the currency, for sell lock the asset


    console.log({ base_ast, quote_ast });


    if (side == 'buy' && required_bal * quote_ast.decimals >= (quote_bal.balance - quote_bal.locked_balance)) {
        return res.status(404).json({ message: 'Insufficient wallet balance' });
    } else if (side == 'sell' && quantity * base_ast.decimals >= base_bal.balance) {
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
                    increment: quote_ast.decimals * required_bal
                },
                balance: {
                    decrement: quote_ast.decimals * required_bal
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
                    increment: base_ast.decimals * quantity
                },
                balance: {
                    decrement: base_ast.decimals * quantity
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

    const payload: any = { type, quantity, price, symbol, side, user_id };


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

    const res_data: any = await get_identifier();

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
});

router.post('/api/exchange/future/order', async (req, res) => {
    //todo
    // if user has wallet balance than than value they wanted to buy then throw error

    //  if user has asset quantity less than they wanted to sell , then throw error

    //if asset is not available on orderbook throw error

    // //  publish to queue
    //  wait until we got request identifier
    //return filled quantity

    const { type, side, quantity, price, asset, user_id } = req.body;

    console.log({ asset });

    const request_id = crypto.randomUUID();

    console.log({ request_id });

    const wallet_balance = 100000;

    if (side == 'buy' && price * quantity > wallet_balance) {
        return res.status(404).json({ message: 'Insufficient wallet balance' });
    }

    //  get from db
    const available_assets = [
        {
            asset: 'BTC',
            quantity: 100,
        },
        {
            asset: 'ETH',
            quantity: 200,
        },
    ];

    const current_asset: any = available_assets.find((a) => a.asset == asset);

    if (!current_asset) {
        return res.status(404).json({ message: 'Asset not found' });
    }

    if (side == 'sell' && current_asset?.quantity < quantity) {
        return res
            .status(404)
            .json({ message: 'Not enough asset quantity to sell' });
    }

    // Every message sent from the backend to the engine includes:

    //correlationId
    //responseQueue
    //type
    //payload

    //The engine must reply to message.responseQueue and include the same correlationId.

    const payload = { type, quantity, price, asset, user_id, side };

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

    const res_data: any = await get_identifier();

    console.log({ res_data });

    const parsed_res = JSON.parse(res_data?.element);

    console.log({ parsed_res });

    res.json({ message: 'order placed', data: parsed_res });
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

    const res_data: any = await get_identifier();

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

    const res_data: any = await get_identifier();

    console.log({ res_data });

    const parsed_res = JSON.parse(res_data?.element);

    console.log({ parsed_res });

    res.json({ message: parsed_res.status, data: parsed_res });
});


router.get('/api/exchange/depth/:symbol', (req, res) => {
    //todo
    //sends get-depth to engine
});


export default router;
