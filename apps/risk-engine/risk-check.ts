import { createClient } from 'redis';
import { LEVERAGES, PRICES, ASSETS, BALANCES } from "./shared-state";
import { Decimal } from "database/generated/prisma/internal/prismaNamespace";

export type engineStatus = | 'pending' | 'ready' | 'down';

//risk-engine-req-queue => client => for receving order request from api to risk engine 

//risk-engine-res-queue => publishClient =>  for risk engine to send res to api 

//leverage-req-queue => leverageClient => for receiving leverage from api to risk engine

//leverage-db-queue => leveragePubClient => for sending leverage res to db worker from risk engine


let risk_engine_status: engineStatus = 'down'

const client = createClient();
client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const publishclient = createClient();
publishclient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const leverageClient = createClient();
leverageClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const leveragePubClient = createClient();
leveragePubClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const priceStreamClient = createClient();
priceStreamClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const matchineEngClient = createClient();
matchineEngClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const riskToAPIclient = createClient();
riskToAPIclient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

export const risk_check_service = async () => {
    await Promise.all([
        client.connect(),
        publishclient.connect(),
        leverageClient.connect(),
        priceStreamClient.connect(),
        matchineEngClient.connect(),
        riskToAPIclient.connect()
    ])
    console.log("All redis client connected successfully");

    while (1) {
        //initialize perp orderbook
        //load all user asset balance and leverage

        const risk_engine_req = await client.brPop('risk-engine-req-queue', 2);

        console.log({ risk_engine_req });

        //console.log({ SHARED_ORDERBOOK, FILLS, PRICES });
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

        //if (risk_engine_status != 'ready') {
        //    const res_data = {
        //        request_id: parsed_req.request_id,
        //        status: 'Request rejected',
        //        message: 'Risk engine is not ready to accept orders',
        //    };

        //    publishclient.lPush(
        //        `risk-engine-res-queue-${parsed_req.BACKEND_ID}`,
        //        JSON.stringify(res_data),
        //    );
        //}

        if (parsed_req) {
            if (parsed_req.command == 'create-order') {
                console.log({ parsed_req });

                const base_ast_sym = parsed_req.payload.symbol.split("_")[0];

                console.log({ ASSETS });

                const base_ast = ASSETS.find(a => a.symbol == base_ast_sym);
                console.log({ base_ast });

                const quote_ast_sym = parsed_req.payload.symbol.split("_")[1];
                console.log({ PRICES });

                const base_price = base_ast && PRICES.get(base_ast_sym);

                console.log({ base_price });

                const user_leverage = LEVERAGES.find(l => l.user_id === parsed_req.payload.user_id);
                console.log({ user_leverage });

                const mark_price = base_price?.mark_price;

                console.log({ mark_price });


                const position_notional = new Decimal(parsed_req.payload.quantity);

                console.log({ position_notional });

                const position_notional_val = mark_price && position_notional.mul(mark_price)

                const lev_limit = new Decimal(user_leverage.limit);

                console.log({ lev_limit });


                const initial_margin = position_notional_val && position_notional_val.mul(lev_limit)

                console.log({ initial_margin });

                const payload = {
                    ...parsed_req.payload,
                    initial_margin: initial_margin
                };

                const user_ast_bal = BALANCES.find(u => u.user_id == parsed_req.payload.user_id);

                console.log({ user_ast_bal, initial_margin });

                if (user_ast_bal && user_ast_bal.balance >= initial_margin) {
                    console.log("Risk engine approved this order, move to matching engine");

                    await matchineEngClient.lPush("risk-to-matching-eng", JSON.stringify({
                        BACKEND_ID: parsed_req.BACKEND_ID,
                        request_id: parsed_req.request_id,
                        payload,
                        command: 'create-order',
                    }))

                } else {
                    console.log("Risk engine rejected order, as not have enough margin to open this position, api endpoint should get response back");

                    //const init_margin = new Prisma.Decimal(initial_margin);
                    //const margin = readableDecimal(init_margin, quote_ast.decimals);

                    //console.log({ init_margin, margin, initial_margin });

                    const res_data = {
                        request_id: parsed_req.request_id,
                        order_id: parsed_req.order_id,
                        payload: '',
                        status: 'order rejected',
                        message: 'do not have engough margin to open position'
                    };
                    console.log({ url: `response-queue-perp-${parsed_req.BACKEND_ID}` });

                    riskToAPIclient.lPush(
                        `response-queue-perp-${parsed_req.BACKEND_ID}`,
                        JSON.stringify(res_data),
                    );

                }

            }
        }

        if (parsed_leverage_req) {
            if (parsed_leverage_req.command == 'leverage-update') {
                //update user's leverage then send to db worker
                const { leverage, user_id } = parsed_leverage_req.payload;
                console.log({ user_id, leverage });

                const current_lev = LEVERAGES.find(l => l.user_id == user_id);

                if (!current_lev) {
                    LEVERAGES.push({ limit: leverage, user_id: user_id })

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
}