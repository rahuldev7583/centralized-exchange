import { Prisma, prisma, } from "database";
import { priceToBigInt18, readableDecimal, scaledDecimal, type Orderbook } from "shared-types";
import { createClient } from 'redis';


export type engineStatus = | 'pending' | 'ready' | 'down';

export const ORDERBOOK = new Map<string, Orderbook>();

const STREAM_NAME = 'book-and-prices:events';
const GROUP_NAME = 'book-and-prices-processors';
const CONSUMER_NAME = `worker-${process.pid}`;


//risk-engine-req-queue => client => for receving order request from api to risk engine 

//risk-engine-res-queue => publishClient =>  for risk engine to send res to api 

//leverage-req-queue => leverageClient => for receiving leverage from api to risk engine

//leverage-db-queue => leveragePubClient => for sending leverage res to db worker from risk engine

// stream for receiving prices from price stream=> priceStreamClient

async function initializeStreamAndGroup() {

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


let leverages = [];
let balances = [];
let assets = [];

let risk_engine_status: engineStatus = 'down'

const client = createClient();

client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

client.connect();
console.log('Connected');

const publishclient = createClient();

publishclient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

publishclient.connect();

console.log('publish Connected');

const leverageClient = createClient();

leverageClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

leverageClient.connect();
console.log('leverageClient Connected');

const leveragePubClient = createClient();

leveragePubClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

leveragePubClient.connect();
console.log('leverageClient Connected');

const priceStreamClient = createClient();
priceStreamClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);
priceStreamClient.connect();
console.log('priceStreamClient Connected');


const matchineEngClient = createClient();
matchineEngClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);
matchineEngClient.connect();
console.log('matchineEngClient Connected');

const riskToAPIclient = createClient();
riskToAPIclient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);
riskToAPIclient.connect();

export const getPriceAndOrderbook = async () => {
    try {
        const response = await priceStreamClient.xReadGroup(
            GROUP_NAME,
            CONSUMER_NAME,
            { key: STREAM_NAME, id: '>' },
            { COUNT: 1, BLOCK: 5000 }
        );

        //console.log({ response });

        if (!response || response.length === 0) return;

        const [{ messages }] = response;

        console.log({ messages });

        for (const message of messages) {
            const { id, message: data } = message;

            console.log({ message });
            console.log(`[Consumer] Processing message ${id}:`, data);

            //get the asset last traded price from matching engine

            await client.xAck(STREAM_NAME, GROUP_NAME, id);
            console.log(`[Consumer] Acknowledged message ${id}`);

        }

        return messages
    } catch (error) {
        console.error('[Consumer Error]', error);

        await new Promise(resolve => setTimeout(resolve, 2000));

    }
}


while (1) {
    //initialize perp orderbook
    //load all user asset balance and leverage

    await initializeStreamAndGroup();
    if (risk_engine_status == 'down') {
        risk_engine_status = 'pending'
    }

    if (risk_engine_status != 'ready') {

        const markets = await prisma.market.findMany({
            where: {
                type: 'Perp'
            }
        });

        console.log({ markets });
        if (!markets) {
            //error market not intitialized

        }

        for (let i = 0; i < markets.length; i++) {

            ORDERBOOK.set(markets[i]?.symbol || 'Undefined', {
                asks: new Map(),
                bids: new Map()
            })
        }

        balances = await prisma.asset_balance.findMany();
        console.log({ balances });

        leverages = await prisma.leverage.findMany();
        console.log({ leverages });

        assets = await prisma.asset.findMany();
        console.log({ assets });


        risk_engine_status = 'ready'
    }


    const risk_engine_req = await client.brPop('risk-engine-req-queue', 2);

    console.log({ risk_engine_req });

    console.log({ ORDERBOOK });

    console.log({ risk_engine_status });

    const leverage_req = await leverageClient.brPop('leverage-req-queue', 2);
    console.log({ leverage_req });

    if (!risk_engine_req && !leverage_req) {
        continue;
    }

    let parsed_req;
    let parsed_leverage_req;

    if (risk_engine_req) {
        parsed_req = JSON.parse(risk_engine_req.element);
        console.log({ parsed_req });
    }


    if (leverage_req) {
        parsed_leverage_req = JSON.parse(leverage_req.element);
        console.log({ parsed_leverage_req });
    }

    if (risk_engine_status != 'ready') {
        const res_data = {
            request_id: parsed_req.request_id,
            status: 'Request rejected',
            message: 'Risk engine is not ready to accept orders',
        };

        publishclient.lPush(
            `risk-engine-res-queue-${parsed_req.BACKEND_ID}`,
            JSON.stringify(res_data),
        );
    }

    if (parsed_req.command == 'create-order') {
        console.log({ parsed_req });


        const res = await getPriceAndOrderbook();
        const msg = res[0].message;

        const base_ast_sym = parsed_req.payload.symbol.split("_")[0];
        const base_ast = assets.find(a => a.symbol == base_ast_sym);

        const quote_ast_sym = parsed_req.payload.symbol.split("_")[0];
        const quote_ast = assets.find(a => a.symbol == quote_ast_sym);

        const index_price = scaledDecimal(msg.index_price, base_ast.decimals);
        const mark_price = scaledDecimal(msg.mark_price, base_ast.decimals);

        console.log({ index_price, mark_price });

        const user_leverage = leverages.find(l => l.user_id === parsed_req.payload.user_id);
        console.log({ user_leverage });

        const position_notional = parsed_req.payload.quantity * mark_price;
        const initial_margin = position_notional * user_leverage.limit;

        console.log({ initial_margin });

        const payload = {
            ...parsed_req.payload,
            initial_margin: initial_margin
        };

        const user_ast_bal = balances.find(u => u.user_id == parsed_req.payload.user_id);

        console.log({ user_ast_bal, initial_margin });

        if (user_ast_bal.balance >= initial_margin) {
            console.log("Risk engine approved this order, move to matching engine");

            await matchineEngClient.lPush("risk-to-matching-eng", JSON.stringify({
                BACKEND_ID: parsed_req.BACKEND_ID,
                request_id: parsed_req.request_id,
                payload,
                command: 'create-order',
            }))

        } else {
            console.log("Risk engine rejected order, as not have enough margin to open this position, api endpoint should get response back");

            const init_margin = new Prisma.Decimal(initial_margin);
            const margin = readableDecimal(init_margin, quote_ast.decimals);

            console.log({ init_margin, margin, initial_margin });

            const res_data = {
                request_id: parsed_req.request_id,
                order_id: parsed_req.order_id,
                payload: { ...payload, margin: margin },
                status: 'order rejected',
                message: 'do not have engough margin to open position'
            };

            riskToAPIclient.lPush(
                `response-queue-perp-${parsed_req.BACKEND_ID}`,
                JSON.stringify(res_data),
            );

        }

    }

    if (parsed_leverage_req) {
        if (parsed_leverage_req.command == 'leverage-update') {
            //update user's leverage then send to db worker
            const { leverage, user_id } = parsed_leverage_req.payload;
            console.log({ user_id, leverage });

            const current_lev = leverages.find(l => l.user_id == user_id);

            if (!current_lev) {
                leverages.push({ limit: leverage, user_id: user_id })

                const res_data = {
                    payload: { leverage, user_id },
                    request_id: parsed_leverage_req.request_id,
                    status: 'Request accepted',
                    message: 'leverage updated successfully',
                };

                leveragePubClient.lPush(
                    `leverage-db-queue`,
                    JSON.stringify(res_data),
                );

            } else {
                current_lev.limit = leverage;

                const res_data = {
                    payload: { leverage, user_id },
                    request_id: parsed_leverage_req.request_id,
                    status: 'Request accepted',
                    message: 'leverage updated successfully',
                };

                leveragePubClient.lPush(
                    `leverage-db-queue`,
                    JSON.stringify(res_data),
                );
            }

        }
    }

}