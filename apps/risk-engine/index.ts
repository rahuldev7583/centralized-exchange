import { prisma, } from "database";
import type { Orderbook } from "shared-types";
import { createClient } from 'redis';


export type engineStatus = | 'pending' | 'ready' | 'down';

export const ORDERBOOK = new Map<string, Orderbook>();

let leverages = [];
let balances = [];

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

while (1) {
    //initialize perp orderbook
    //load all user asset balance and leverage
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

        //calculate the margin, if valid forward to matching engine

        //initial margin , maintaince margin

        //initial margin will be locked in asset balance 

    }

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