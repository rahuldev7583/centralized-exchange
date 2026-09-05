
import { createClient } from "redis";
import { ASSETS, PRICES, SHARED_FILLS, SHARED_ORDERBOOK, LEVERAGES } from "./shared-state";

const matchineEngClient = createClient();
matchineEngClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const liquidation_check = async () => {
    const LIQUIDATION_USER_ID = process.env.LIQUIDATION_USER_ID || 0;
    const MAINTAINANCE_RATE = 0.5;
    //i have to loop over all asset orderbook's bids and asks, calculated uPNL, then margin balnace, then if any position's margin balance is less than maintiance margin then force fully close this from market flush, isurance fund or ADL

    //i will send postions that need to be liquidate to matching engine a liqudation command

    SHARED_FILLS.map(async (f) => {
        console.log({ f });
        const ast = ASSETS.find(a => a.symbol == f.symbol);
        console.log({ ast });

        const ast_price = PRICES.get(ast.symbol);
        console.log({ ast_price });

        const mark_price = Number(ast_price?.mark_price);

        const long_uPnL = (mark_price - f.price) * f.filled_quantity
        const short_uPnL = (f.price - mark_price) * f.filled_quantity

        console.log({ long_uPnL, short_uPnL });

        //need levarage

        //need initial margin
        //calculate margin balance and maitaince margin

        //positional notional value => quantity * mark price
        //initial_margin = positional value / leverage

        //margin_balance = initial margin + uPNL
        //Maintenance margin = position notional value * maintaince_margin_rate

        //margin balance <= maintainance margin => liquidate


        const postional_value = f.quantity * mark_price;

        const long_leverage = LEVERAGES.find(l => l.user_id == f.buy_user_id);
        const short_leverage = LEVERAGES.find(l => l.user_id == f.sell_user_Id);

        const long_initial_marg = postional_value / long_leverage;
        const short_initial_marg = postional_value / short_leverage;

        const long_margin_bal = long_initial_marg + long_uPnL;
        const short_margin_bal = short_initial_marg + short_uPnL;

        const maintaince_margin = postional_value * MAINTAINANCE_RATE;

        //send create market order to matching engine

        if (long_margin_bal <= maintaince_margin) {
            //liquidate long position

            const payload: any = { type: 'market', quantity: f.filled_quantity, symbol: f.symbol, side: 'sell', user_id: LIQUIDATION_USER_ID };

            await matchineEngClient.lPush("liquidation-to-matching-eng", JSON.stringify({
                payload,
                command: 'forced-liquidate',
                BACKEND_ID: '',
                request_id: crypto.randomUUID()
            }))

        } else if (short_margin_bal <= maintaince_margin) {
            //liquidate short 
            const payload: any = { type: 'market', quantity: f.filled_quantity, symbol: f.symbol, side: 'buy', user_id: LIQUIDATION_USER_ID };

            await matchineEngClient.lPush("liquidation-to-matching-eng", JSON.stringify({
                payload,
                command: 'forced-liquidate',
                BACKEND_ID: '',
                request_id: crypto.randomUUID()
            }))
        }
    })
}

export const liquidation_service = async () => {

    await Promise.all([
        matchineEngClient.connect()
    ]);

    console.log("All redis client connected successfully");

    setInterval(() => {
        console.log("liquidation");
        console.log({ SHARED_ORDERBOOK, PRICES, ASSETS, SHARED_FILLS });
        liquidation_check();

    }, 5000)
}
