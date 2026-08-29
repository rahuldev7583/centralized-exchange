import { createClient } from 'redis';
import { ASSETS, FILLS, ORDERBOOK, type Fill, type OpenOrder, type Order, type Orderbook } from "shared-types";
import { prisma } from "database";

export type engineStatus = | 'pending' | 'ready' | 'down';
export type requestStatus = | 'order accepted' | 'order rejected' | 'order pending' | 'order cancelled';

export type engineCommand =
    | 'create_order'
    | 'cancel_order'
    | 'get-order'
    | 'get-balance'
    | 'get-depth'
    | 'create-asset';

export interface engineRequest {
    backend_id: string;
    request_id: string;
    payload: any;
    command: engineCommand;
}

export interface engineResponse {
    request_id: string;
    order_id: string
    status: requestStatus;
    message: string,
    price: number,
    filled_quantity: number,
    data?: any
}
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

const dbWorkerclient = createClient();

dbWorkerclient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

dbWorkerclient.connect();

console.log('dbWorkerclient Connected');

//const ORDERBOOK: any = {
//  BTC: {
//    bids: [],
//    asks: [], 
//  },
//  ETH: {
//    bids: [],
//    asks: [],
//  },
//};

//const FILLS: any = [];
//const BALANCES: any = [];
//const ORDERS: any = [];

const create_order = (payload: any, backend_id: string, request_id: string) => {
    console.log({ payload });
    console.log({ ORDERBOOK });
    const order_id: string = crypto.randomUUID();

    const market = ORDERBOOK.get(payload.symbol);
    console.log({ market });

    if (!market) {
        console.log('Market not available on orderbook');

        //error market not available on orderbook

        const res_data: engineResponse = {
            request_id,
            order_id,
            status: 'order rejected',
            message: 'Market not available on orderbook',
            price: payload.price,
            filled_quantity: 0
        };

        publishclient.lPush(
            `response-queue-${backend_id}`,
            JSON.stringify(res_data),
        );

        return;
    }

    //for buy => lowest available price on orderbook
    //for sell => highest available price on orderbook



    if (payload.type == 'market') {
        //execute immediately
        //calculate best price and update orderbook
        console.log('market order');

        //i have to track last best price and quantity

        if (payload.side === 'buy') {
            console.log({ market });

            let lowest_price = 0;
            let lowest_order: string = '';

            if (market.asks.size > 0) {
                for (const [key, value] of market.asks.entries()) {
                    console.log({ key, value });
                    if (lowest_price === 0 && value.user_id !== payload.user_id) {
                        lowest_price = value.price;
                        lowest_order = key;
                    } else if (value.price <= lowest_price && value.user_id !== payload.user_id) {
                        lowest_price = value.price;
                        lowest_order = key;
                    }
                }
            }

            console.log({ lowest_order });
            console.log({ lowest_price });

            let filled_quantity: any = 0;
            let matching_orders: any = [];
            console.log({ filled_quantityAT_118: filled_quantity });

            //  what if sort the order by price then loop through it, until got filled

            market.asks.forEach((k, v) => {
                console.log({ k, v });

                //order will partially or fully filled based on quantity

                //  get the the all the order matching calculate total quantity until either order got fully filled or no other asset available at this price or lower

                console.log({ lowest_price });

                if (k.price <= lowest_price && k.user_id !== payload.user_id) {
                    //do the matching
                    lowest_price = k.price;
                    lowest_order = v;
                    console.log({ filled_quantity_AT_133: filled_quantity, payload });

                    if (filled_quantity < payload.quantity) {
                        //not fully filled yet
                        //decrease and/or remove that asks side of this price

                        console.log(`Remove this order from asks`);

                        console.log({
                            filled_quantity,
                            quan: k.quantity,
                            asked_quan: payload.quantity,
                        });

                        if (k.quantity > payload.quantity - filled_quantity) {
                            //fully filed with this order only
                            console.log(
                                'current order quantity more than the fill required. so decrease this order quantity',
                            );

                            const current_ast: any = market.asks.get(v);
                            console.log({ current_ast });

                            filled_quantity += payload.quantity - filled_quantity;

                            const fill: Fill = {
                                type: payload.type,
                                quantity: payload.quantity,
                                filled_quantity: payload.quantity - filled_quantity,
                                price: payload.price,
                                symbol: payload.symbol,

                                buy_user_id: payload.user_id,
                                sell_user_Id: current_ast.user_id,

                                buy_order_id: order_id,
                                sell_order_id: current_ast.order_id,

                                fill_id: crypto.randomUUID(),
                                created_at: Date.now()

                            };
                            console.log({ fill });




                            //dbWorkerclient.lPush(
                            //    `settlement-queue`,
                            //    JSON.stringify(res_data, payload),
                            //);
                            FILLS.push(fill);

                            dbWorkerclient.lPush(
                                `settlement-queue`,
                                JSON.stringify(fill, payload),
                            );
                            market.asks.set(v, {
                                ...k,
                                quantity: k.quantity - (payload.quantity - filled_quantity),
                            });

                        } else if (k.quantity <= payload.quantity - filled_quantity) {
                            //remove from orderbook, increase the fill

                            console.log(
                                'current order quantity less than or equal to the fill required. so delete this order quantity',
                            );

                            const current_ast: any = market.asks.get(v);
                            console.log({ current_ast });

                            filled_quantity += current_ast.quantity;

                            console.log({ filled_quantityAT_161: filled_quantity });

                            const fill: Fill = {
                                type: payload.type,
                                quantity: payload.quantity,
                                filled_quantity: current_ast.quantity,
                                price: payload.price,
                                symbol: payload.symbol,

                                buy_user_id: payload.user_id,
                                sell_user_Id: current_ast.user_id,

                                buy_order_id: order_id,
                                sell_order_id: current_ast.order_id,

                                fill_id: crypto.randomUUID(),
                                created_at: Date.now()

                            };
                            console.log({ fill });


                            FILLS.push(fill);

                            dbWorkerclient.lPush(
                                `settlement-queue`,
                                JSON.stringify(fill, payload),
                            );
                            market.asks.delete(v);
                        }
                    }
                } else {
                    console.log('else called at 194');
                    console.log('find the second best price');

                    let second_lowest_price = 0;
                    let second_lowest_id = '';

                    if (market.asks.size > 0) {
                        for (const [key, value] of market.asks.entries()) {
                            console.log({ key, value });

                            if (second_lowest_price === 0 && value.user_id !== payload.user_id) {
                                second_lowest_price = value.price;
                                second_lowest_id = key;
                            } else if (
                                value.price <= second_lowest_price &&
                                value.price > lowest_price && value.user_id !== payload.user_id
                            ) {
                                second_lowest_price = value.price;
                                second_lowest_id = key;
                            }
                        }
                    }

                    console.log({ second_lowest_price, second_lowest_id });

                    //second lowest logic then third etc

                    console.log('new lowest price');
                    lowest_order = second_lowest_id;
                    lowest_price = second_lowest_price;

                    console.log({ lowest_price_AT_213: lowest_price });
                }
            });
            console.log({ filled_quantity_OUT_LOOP: filled_quantity });

            console.log('outside loop');

            const res_data: engineResponse = {
                request_id,
                order_id,
                price: payload.price,
                filled_quantity: filled_quantity,
                status: 'order accepted',
                message: 'Order got filled'
            };
            console.log({ finalOrderbook: ORDERBOOK });

            publishclient.lPush(
                `response-queue-${backend_id}`,
                JSON.stringify(res_data),
            );

            //send fills to db worker which has both buy and sell side of order details
            //one order can have multiple fills to i have to send every fill details to db worker

            //dbWorkerclient.lPush(
            //    `settlement-queue`,
            //    JSON.stringify(res_data, payload),
            //);
            return;
        } else if (payload.side === 'sell') {
            console.log({ market });

            let highest_price = 0;
            let highest_order: string = '';

            if (market.bids.size > 0) {
                for (const [key, value] of market.bids.entries()) {
                    console.log({ key, value });
                    if (highest_price === 0 && value.user_id !== payload.user_id) {
                        highest_price = value.price;
                        highest_order = key;
                    } else if (value.price >= highest_price && value.user_id !== payload.user_id) {
                        highest_price = value.price;
                        highest_order = key;
                    }
                }
            }

            console.log({ highest_order });
            console.log({ highest_price });

            let filled_quantity: any = 0;
            let matching_orders: any = [];
            console.log({ filled_quantityAT_118: filled_quantity });

            //  what if sort the order by price then loop through it, until got filled

            market.bids.forEach((k, v) => {
                console.log({ k, v });

                //order will partially or fully filled based on quantity

                //  get the the all the order matching calculate total quantity until either order got fully filled or no other asset available at this price or lower

                console.log({ highest_price });

                if (k.price >= highest_price && k.user_id !== payload.user_id) {
                    //do the matching
                    highest_price = k.price;
                    highest_order = v;
                    console.log({ filled_quantity_AT_133: filled_quantity, payload });

                    if (filled_quantity < payload.quantity) {
                        //not fully filled yet
                        //decrease and/or remove that asks side of this price

                        console.log(`Remove this order from asks`);

                        console.log({
                            filled_quantity,
                            quan: k.quantity,
                            asked_quan: payload.quantity,
                        });

                        if (k.quantity > payload.quantity - filled_quantity) {
                            //fully filed with this order only
                            console.log(
                                'current order quantity more than the fill required. so decrease this order quantity',
                            );

                            const current_ast: any = market.bids.get(v);
                            console.log({ current_ast });

                            filled_quantity += payload.quantity - filled_quantity;


                            const fill: Fill = {
                                type: payload.type,
                                quantity: payload.quantity,
                                filled_quantity: payload.quantity - filled_quantity,
                                price: payload.price,
                                symbol: payload.symbol,

                                buy_user_id: payload.user_id,
                                sell_user_Id: current_ast.user_id,

                                buy_order_id: order_id,
                                sell_order_id: current_ast.order_id,

                                fill_id: crypto.randomUUID(),
                                created_at: Date.now()

                            };
                            console.log({ fill });
                            FILLS.push(fill);

                            dbWorkerclient.lPush(
                                `settlement-queue`,
                                JSON.stringify(fill, payload),
                            );

                            market.asks.set(v, {
                                ...k,
                                quantity: k.quantity - (payload.quantity - filled_quantity),
                            });
                        } else if (k.quantity <= payload.quantity - filled_quantity) {
                            //remove from orderbook, increase the fill

                            console.log(
                                'current order quantity less than or equal to the fill required. so delete this order quantity',
                            );

                            const current_ast: any = market.bids.get(v);
                            console.log({ current_ast });

                            filled_quantity += current_ast.quantity;

                            console.log({ filled_quantityAT_161: filled_quantity });


                            const fill: Fill = {
                                type: payload.type,
                                quantity: payload.quantity,
                                filled_quantity: current_ast.quantity,
                                price: payload.price,
                                symbol: payload.symbol,

                                buy_user_id: payload.user_id,
                                sell_user_Id: current_ast.user_id,

                                buy_order_id: order_id,
                                sell_order_id: current_ast.order_id,

                                fill_id: crypto.randomUUID(),
                                created_at: Date.now()

                            };
                            console.log({ fill });
                            FILLS.push(fill);

                            dbWorkerclient.lPush(
                                `settlement-queue`,
                                JSON.stringify(fill),
                            );

                            market.asks.delete(v);
                        }
                    }
                } else {
                    console.log('else called at 194');
                    console.log('find the second best price');

                    let second_highest_price = 0;
                    let second_highest_id = '';

                    if (market.bids.size > 0) {
                        for (const [key, value] of market.bids.entries()) {
                            console.log({ key, value });

                            if (second_highest_price === 0 && value.user_id !== payload.user_id) {
                                second_highest_price = value.price;
                                second_highest_id = key;
                            } else if (
                                value.price >= second_highest_price &&
                                value.price < highest_price && value.user_id !== payload.user_id
                            ) {
                                second_highest_price = value.price;
                                second_highest_id = key;
                            }
                        }
                    }

                    console.log({ second_highest_price, second_highest_id });

                    //second lowest logic then third etc

                    console.log('new second_highest price');
                    highest_order = second_highest_id;
                    highest_price = second_highest_price;

                    console.log({ lowest_price_AT_213: highest_price });
                }
            });
            console.log({ filled_quantity_OUT_LOOP: filled_quantity });

            console.log('outside loop');

            const res_data: engineResponse = {
                request_id,
                order_id,
                price: payload.price,
                filled_quantity: filled_quantity,
                status: 'order accepted',
                message: 'Order got filled'
            };
            console.log({ finalOrderbook: ORDERBOOK });

            publishclient.lPush(
                `response-queue-${backend_id}`,
                JSON.stringify(res_data),
            );

            //dbWorkerclient.lPush(
            //    `settlement-queue`,
            //    JSON.stringify({ ...res_data, ...payload }),
            //);
            return;
        }
    } else {
        if (payload.side == 'buy') {
            //fill order, decrease user wallet balance , increase that asset , decrease that asset quantity from orderbook
            console.log({ market });
            let lowest_price = 0;
            let lowest_order: string = '';

            if (market.asks.size > 0) {
                for (const [key, value] of market.asks.entries()) {
                    console.log({ key, value });
                    if (lowest_price === 0 && value.user_id !== payload.user_id) {
                        lowest_price = value.price;
                        lowest_order = key;
                    } else if (value.price <= lowest_price && value.user_id !== payload.user_id) {
                        lowest_price = value.price;
                        lowest_order = key;
                    }
                }
            }

            console.log({ lowest_order });
            console.log({ lowest_price });

            //  if there is no asks then no need to compare

            if (
                market.asks.size == 0 ||
                (market.asks.size > 0 && payload.price < lowest_price)
            ) {
                console.log('push to orderbook');

                //const order_id: string = crypto.randomUUID();

                //const set_asset: Order = {
                //  order_id,

                //  side: payload.side,
                //  price: payload.price,
                //  quantity: payload.quantity,
                //  user_id: payload.user_id,
                //  request_id,
                //  type: 'limit',
                //  asset: payload.asset,
                //  fills: [],
                //  created_at: Date.now(),
                //};

                //console.log({ set_asset });

                market.bids.set(order_id, {
                    order_id,

                    side: payload.side,
                    price: payload.price,
                    quantity: payload.quantity,
                    user_id: payload.user_id,
                    request_id,

                    type: payload.type,

                    symbol: payload.symbol,

                    created_at: Date.now(),
                });
                console.log({ updatedOrderbook: ORDERBOOK });

                console.log({ bids: market.bids });

                const res_data: engineResponse = {
                    request_id,
                    order_id,
                    price: payload.price,
                    filled_quantity: 0,
                    status: 'order accepted',
                    message: 'Sitting on orderbook'
                };

                publishclient.lPush(
                    `response-queue-${backend_id}`,
                    JSON.stringify(res_data),
                );
                //dbWorkerclient.lPush(
                //    `settlement-queue`,
                //    JSON.stringify({ ...res_data, ...payload }),
                //);
                return;
            } else {
                console.log('else called');
                console.log('price got matched or available at lower price');

                //order will partially or fully filled

                //decrease the quantity from orderbook
                //if no other quantity on orderbook of that asset then remove the asset as well

                //get the orders that are filled , and remove them

                console.log({ ORDERBOOKAT219: ORDERBOOK });

                let total_quantity = 0;
                let matching_orders: any = [];

                market.asks.forEach((k, v) => {
                    console.log({ k, v });

                    //order will partially or fully filled based on quantity

                    //  get the the all the order matching at this price, calculate total quantity until either order got fully filled or no other asset available at this price or lower

                    if (k.price <= payload.price && k.user_id !== payload.user_id) {
                        if (payload.quantity > total_quantity) {
                            total_quantity += k.quantity;
                            console.log({ total_quantity, quan: k.quantity });
                            console.log('push to matching order until got filled filled ');

                            matching_orders.push(v);
                        }
                    }
                });

                console.log({ total_quantity, matching_orders });

                if (total_quantity >= payload.quantity) {
                    //fully filled
                    //decrease and/or remove that asks side of this price
                    let filled_quantity: any = 0;

                    for (let i = 0; i < matching_orders.length; i++) {
                        console.log(`Remove this order from asks: ${matching_orders[i]}`);
                        console.log({ currentORD: market.asks.get(matching_orders[i]) });

                        const current_ast: any = market.asks.get(matching_orders[i]);
                        console.log({ current_ast });

                        if (current_ast.quantity > payload.quantity - filled_quantity) {
                            console.log(
                                'current order quantity more than the fill required. so decrease this order quantity',
                            );

                            filled_quantity = payload.quantity;

                            const fill: Fill = {
                                type: payload.type,
                                quantity: payload.quantity,
                                filled_quantity: payload.quantity,
                                price: payload.price,
                                symbol: payload.symbol,

                                buy_user_id: payload.user_id,
                                sell_user_Id: current_ast.user_id,

                                buy_order_id: order_id,
                                sell_order_id: current_ast.order_id,

                                fill_id: crypto.randomUUID(),
                                created_at: Date.now()

                            };
                            console.log({ fill });

                            //decrease the order quantity, increase the fill




                            console.log({ matching_orders, currrentMatch: matching_orders[i] });


                            FILLS.push(fill);

                            dbWorkerclient.lPush(
                                `settlement-queue`,
                                JSON.stringify(fill),
                            );

                            market.asks.set(matching_orders[i], {
                                ...current_ast,
                                quantity:
                                    current_ast.quantity - (payload.quantity - filled_quantity),
                            });

                        } else if (
                            current_ast.quantity <=
                            payload.quantity - filled_quantity
                        ) {
                            //remove from orderbook, increase the fill

                            console.log(
                                'current order quantity less than or equal to the fill required. so delete this order quantity',
                            );

                            filled_quantity += current_ast.quantity;

                            const fill: Fill = {
                                type: payload.type,
                                quantity: payload.quantity,
                                filled_quantity: current_ast.quantity,
                                price: payload.price,
                                symbol: payload.symbol,

                                buy_user_id: payload.user_id,
                                sell_user_Id: current_ast.user_id,

                                buy_order_id: order_id,
                                sell_order_id: current_ast.order_id,

                                fill_id: crypto.randomUUID(),
                                created_at: Date.now()

                            };
                            console.log({ fill });
                            FILLS.push(fill);

                            dbWorkerclient.lPush(
                                `settlement-queue`,
                                JSON.stringify(fill),
                            );
                            market.asks.delete(matching_orders[i]);
                        }
                    }

                    console.log({ asks: market.asks });

                    console.log({ filled_quantity });

                    const res_data: engineResponse = {
                        request_id,
                        order_id,
                        price: payload.price,
                        filled_quantity: filled_quantity,
                        status: 'order accepted',
                        message: 'Order got filled'
                    };
                    console.log({ finalOrderbook: ORDERBOOK });

                    publishclient.lPush(
                        `response-queue-${backend_id}`,
                        JSON.stringify(res_data),
                    );
                    //dbWorkerclient.lPush(
                    //    `settlement-queue`,
                    //    JSON.stringify({ ...res_data, ...payload }),
                    //);
                    return;
                } else {
                    //partially filled
                    let filled_orders = [];
                    let filled_quantity = 0;

                    for (let i = 0; i < matching_orders.length; i++) {
                        console.log(`Remove this order from bids: ${matching_orders[i]}`);
                        console.log({ currentORD: market.bids.get(matching_orders[i]) });

                        const current_ast: any = market.asks.get(matching_orders[i]);
                        console.log({ current_ast });

                        if (current_ast.quantity > payload.quantity - filled_quantity) {
                            console.log(
                                'current order quantity more than the fill required. so decrease this order quantity',
                            );

                            //decrease the order quantity, increase the fill

                            market.asks.set(matching_orders[i], {
                                ...current_ast,
                                quantity:
                                    current_ast.quantity - (payload.quantity - filled_quantity),
                            });
                            filled_quantity = payload.quantity;
                        } else if (
                            current_ast.quantity <=
                            payload.quantity - filled_quantity
                        ) {
                            //remove from orderbook, increase the fill

                            console.log(
                                'current order quantity less than or equal to the fill required. so delete this order quantity',
                            );

                            filled_quantity += current_ast.quantity;

                            const fill: Fill = {
                                type: payload.type,
                                quantity: payload.quantity,
                                filled_quantity: current_ast.quantity,
                                price: payload.price,
                                symbol: payload.symbol,

                                buy_user_id: payload.user_id,
                                sell_user_Id: current_ast.user_id,

                                buy_order_id: order_id,
                                sell_order_id: current_ast.order_id,

                                fill_id: crypto.randomUUID(),
                                created_at: Date.now()

                            };
                            console.log({ fill });
                            FILLS.push(fill);

                            dbWorkerclient.lPush(
                                `settlement-queue`,
                                JSON.stringify(fill),
                            );

                            market.asks.delete(matching_orders[i]);
                        }
                    }
                    console.log({ bids: market.bids });

                    console.log({ asks: market.asks });

                    console.log({ filled_quantity });


                    market.bids.set(order_id, {
                        order_id,

                        side: payload.side,
                        price: payload.price,
                        quantity: payload.quantity - filled_quantity,
                        user_id: payload.user_id,
                        request_id,

                        type: payload.type,

                        symbol: payload.symbol,

                        created_at: Date.now(),
                    });

                    const res_data: engineResponse = {
                        request_id,
                        order_id,
                        price: payload.price,
                        filled_quantity: filled_quantity,
                        status: 'order accepted',
                        message: 'Order is partially filled'
                    };
                    console.log({ finalOrderbook: ORDERBOOK });

                    publishclient.lPush(
                        `response-queue-${backend_id}`,
                        JSON.stringify(res_data),
                    );
                    //dbWorkerclient.lPush(
                    //    `settlement-queue`,
                    //    JSON.stringify({ ...res_data, ...payload }),
                    //);
                    return;
                }

                //  update orderbook
            }
        } else if (payload.side == 'sell') {
            //fill order, increase user wallet balance , decrease that asset , increase that asset quantity in orderbook

            let highest_price = 0;
            let highest_order: string = '';

            if (market.bids.size > 0) {
                for (const [key, value] of market.bids.entries()) {
                    console.log({ key, value });
                    if (highest_price === 0 && value.user_id !== payload.user_id) {
                        highest_price = value.price;
                        highest_order = key;
                    } else if (value.price <= highest_price && value.user_id !== payload.user_id) {
                        highest_price = value.price;
                        highest_order = key;
                    }
                }
            }

            console.log({ highest_order });
            console.log({ highest_price });

            if (
                market.bids.size == 0 ||
                (market.bids.size > 0 && payload.price > highest_price)
            ) {
                console.log('push to orderbook');



                console.log({ ORDERBOOK });
                console.log({ bids: market.bids });

                market.asks.set(order_id, {
                    order_id,
                    side: payload.side,
                    price: payload.price,
                    quantity: payload.quantity,
                    user_id: payload.user_id,
                    request_id,
                    type: payload.type,
                    symbol: payload.symbol,
                    created_at: Date.now(),
                });

                console.log({ bids: market.bids });

                const res_data: engineResponse = {
                    request_id,
                    order_id,
                    price: payload.price,
                    filled_quantity: 0,
                    status: 'order accepted',
                    message: 'Sitting on orderbook'
                };

                publishclient.lPush(
                    `response-queue-${backend_id}`,
                    JSON.stringify(res_data),
                );
                //dbWorkerclient.lPush(
                //    `settlement-queue`,
                //    JSON.stringify({ ...res_data, ...payload }),
                //);
                return;
            } else {
                console.log('else called');
                //  update orderbook

                console.log('price got matched or available at higher price');

                let total_quantity = 0;
                let matching_orders: any = [];

                market.bids.forEach((k, v) => {
                    console.log({ k, v });

                    //order will partially or fully filled based on quantity

                    //  get the the all the order matching at this price, calculate total quantity until either order got fully filled or no other asset available at this price or higher

                    if (k.price >= payload.price && k.user_id != payload.user_id) {
                        if (payload.quantity > total_quantity) {
                            total_quantity += k.quantity;
                            console.log({ total_quantity, quan: k.quantity });
                            console.log('push to matching order until got filled filled ');

                            matching_orders.push(v);
                        }
                    }
                });
                console.log({ total_quantity, matching_orders });

                if (total_quantity >= payload.quantity) {
                    //fully filled
                    //decrease and/or remove that asks side of this price
                    let filled_orders = [];
                    let filled_quantity: any = 0;

                    for (let i = 0; i < matching_orders.length; i++) {
                        console.log(`Remove this order from asks: ${matching_orders[i]}`);
                        console.log({ currentORD: market.bids.get(matching_orders[i]) });

                        const current_ast: any = market.bids.get(matching_orders[i]);
                        console.log({ current_ast });

                        if (current_ast.quantity > payload.quantity - filled_quantity) {
                            console.log(
                                'current order quantity more than the fill required. so decrease this order quantity',
                            );

                            //decrease the order quantity, increase the fill

                            market.bids.set(matching_orders[i], {
                                ...current_ast,
                                quantity:
                                    current_ast.quantity - (payload.quantity - filled_quantity),
                            });
                            filled_quantity = payload.quantity;
                        } else if (
                            current_ast.quantity <=
                            payload.quantity - filled_quantity
                        ) {
                            //remove from orderbook, increase the fill

                            console.log(
                                'current order quantity less than or equal to the fill required. so delete this order quantity',
                            );

                            filled_quantity += current_ast.quantity;

                            const fill: Fill = {
                                type: payload.type,
                                quantity: payload.quantity,
                                filled_quantity: current_ast.quantity,
                                price: payload.price,
                                symbol: payload.symbol,

                                buy_user_id: current_ast.user_id,
                                sell_user_Id: payload.user_id,

                                buy_order_id: current_ast.order_id,
                                sell_order_id: order_id,

                                fill_id: crypto.randomUUID(),
                                created_at: Date.now()

                            };
                            console.log({ fill });
                            FILLS.push(fill);

                            dbWorkerclient.lPush(
                                `settlement-queue`,
                                JSON.stringify(fill),
                            );

                            market.bids.delete(matching_orders[i]);
                        }
                    }

                    console.log({ bids: market.bids });

                    console.log({ filled_quantity });

                    const res_data: engineResponse = {
                        request_id,
                        order_id,
                        price: payload.price,
                        filled_quantity: filled_quantity,
                        status: 'order accepted',
                        message: 'Order got filled'
                    };
                    console.log({ finalOrderbook: ORDERBOOK });



                    publishclient.lPush(
                        `response-queue-${backend_id}`,
                        JSON.stringify(res_data),
                    );
                    //dbWorkerclient.lPush(
                    //    `settlement-queue`,
                    //    JSON.stringify({ ...res_data, ...payload }),
                    //);
                    return;
                } else {
                    //partially filled
                    let filled_orders = [];
                    let filled_quantity = 0;

                    for (let i = 0; i < matching_orders.length; i++) {
                        console.log(`Remove this order from asks: ${matching_orders[i]}`);
                        console.log({ currentORD: market.asks.get(matching_orders[i]) });

                        const current_ast: any = market.bids.get(matching_orders[i]);
                        console.log({ current_ast });

                        if (current_ast.quantity > payload.quantity - filled_quantity) {
                            console.log(
                                'current order quantity more than the fill required. so decrease this order quantity',
                            );

                            //decrease the order quantity, increase the fill

                            market.bids.set(matching_orders[i], {
                                ...current_ast,
                                quantity:
                                    current_ast.quantity - (payload.quantity - filled_quantity),
                            });
                            filled_quantity = payload.quantity;
                        } else if (
                            current_ast.quantity <=
                            payload.quantity - filled_quantity
                        ) {
                            //remove from orderbook, increase the fill

                            console.log(
                                'current order quantity less than or equal to the fill required. so delete this order quantity',
                            );

                            filled_quantity += current_ast.quantity;

                            const fill: Fill = {
                                type: payload.type,
                                quantity: payload.quantity,
                                filled_quantity: current_ast.quantity,
                                price: payload.price,
                                symbol: payload.symbol,

                                buy_user_id: current_ast.user_id,
                                sell_user_Id: payload.user_id,

                                buy_order_id: current_ast.order_id,
                                sell_order_id: order_id,

                                fill_id: crypto.randomUUID(),
                                created_at: Date.now()

                            };
                            console.log({ fill });
                            FILLS.push(fill);

                            dbWorkerclient.lPush(
                                `settlement-queue`,
                                JSON.stringify(fill),
                            );

                            market.bids.delete(matching_orders[i]);
                        }
                    }
                    console.log({ bids: market.bids });

                    console.log({ filled_quantity });

                    market.asks.set(order_id, {
                        order_id,
                        side: payload.side,
                        price: payload.price,
                        quantity: payload.quantity - filled_quantity,
                        user_id: payload.user_id,
                        request_id,
                        type: payload.type,
                        symbol: payload.symbol,
                        created_at: Date.now(),
                    });

                    const res_data: engineResponse = {
                        request_id,
                        order_id,
                        price: payload.price,
                        filled_quantity: filled_quantity,
                        status: 'order accepted',
                        message: 'Order got partially filled'
                    };
                    console.log({ finalOrderbook: ORDERBOOK });

                    publishclient.lPush(
                        `response-queue-${backend_id}`,
                        JSON.stringify(res_data),
                    );
                    //dbWorkerclient.lPush(
                    //    `settlement-queue`,
                    //    JSON.stringify({ ...res_data, ...payload }),
                    //);
                    return;
                }
            }
        }
    }
};

const cancel_order = (payload: any, backend_id: string, request_id: string) => {
    //todo
    //cancel order by order by and remove from orderbook
    console.log({ payload });
    console.log({ ORDERBOOK });

    console.log({ ORDERBOOK });
    let order: any;
    ORDERBOOK.forEach((key, value) => {
        console.log({ key, value });

        key.asks.forEach((v, k) => {
            console.log({ v, k, payload });

            if (v.order_id == payload) {
                console.log({ k, v });

                order = v;

                ORDERBOOK.get(value)?.asks.delete(k);
            }
        });
        key.bids.forEach((v, k) => {
            console.log({ v, k, payload });
            if (v.order_id == payload) {
                order = v;
                console.log({ k, v });

                ORDERBOOK.get(value)?.bids.delete(k);
            }
        });
    });

    console.log({ order });

    console.log({ ORDERBOOK });
    console.log('order cancelled');


    if (!order) {
        const res_data: engineResponse = {
            request_id,
            order_id: '',
            filled_quantity: 0,
            price: payload.price,
            status: 'order pending',
            message: 'order not found'
        };

        publishclient.lPush(`response-queue-${backend_id}`, JSON.stringify(res_data));
        return;
    }

    const res_data: engineResponse = {
        request_id,
        order_id: order.id,
        price: payload.price,
        data: order,
        filled_quantity: 0,
        status: 'order cancelled',
        message: ''
    };

    publishclient.lPush(`response-queue-${backend_id}`, JSON.stringify(res_data));


    const settle = { request_id, status: 'order cancelled', filled_quantity: 0, message: '', ...order };

    dbWorkerclient.lPush(
        `settlement-queue`,
        JSON.stringify(settle),
    );
    return;
};

const get_order = (payload: any, backend_id: string, request_id: string) => {
    //todo
    //get order details by order id
    console.log({ payload });
    console.log({ ORDERBOOK });
    let order;
    ORDERBOOK.forEach((v, k) => {
        v.asks.forEach((v, k) => {
            console.log({ v, k, payload });

            if (v.order_id == payload) {
                order = v;
            }
        });
        v.bids.forEach((v, k) => {
            console.log({ v, k, payload });
            if (v.order_id == payload) {
                order = v;
            }
        });
    });

    console.log({ order });

    const res_data: engineResponse = {
        request_id,
        data: order,
        status: 'order pending',
        message: 'Order is Sitting on orderbook',
        order_id: '',
        price: 0,
        filled_quantity: 0
    };

    publishclient.lPush(`response-queue-${backend_id}`, JSON.stringify(res_data));
    return;
};

const get_balance = (payload: any, backend_id: string, request_id: string) => {
    //todo
    //get the user assets by user id
};

const get_depth = (payload: any, backend_id: string, request_id: string) => {
    //todo;
};

const create_asset = (payload: any, backend_id: string, request_id: string) => {
    console.log({ payload });
    const ordrbook = Object.fromEntries(ORDERBOOK);
    console.log({ ORDERBOOK });
    console.log({ ordrbook });

    const existing_ast = ASSETS.find(
        (a) => a.name == payload.name || a.symbol == payload.symbol,
    );

    console.log({ existing_ast });

    if (existing_ast) {
        const res_data = {
            request_id,
            ASSETS,
            ORDERBOOK,
        };

        publishclient.lPush(
            `response-queue-${backend_id}`,
            JSON.stringify(res_data),
        );
        return;
    }

    ASSETS.push(payload);

    console.log({ ASSETS });

    ORDERBOOK.set(payload.symbol, {
        asks: new Map(),
        bids: new Map(),
    });

    const res_data = {
        request_id,
        ASSETS,
        ORDERBOOK,
    };

    publishclient.lPush(`response-queue-${backend_id}`, JSON.stringify(res_data));
};

let engine_status: engineStatus = 'down'

while (1) {

    if (engine_status == 'down') {
        engine_status = 'pending'
    }
    //get the asset and markets from db, last snapshot from s3 and construct orderbook

    //matching engine will not accept order until it create and all markets spot and perps for all asset pairs

    if (engine_status != 'ready') {

        const markets = await prisma.market.findMany();

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

        engine_status = 'ready'
    }

    const incoming_req = await client.brPop('incoming-request', 2);

    //  const res = await client.brPop('create-order', 2);

    console.log({ incoming_req });

    console.log({ ORDERBOOK });

    //console.log({ engine_status });

    console.log({ engine_status });

    console.log({ FILLS });



    if (!incoming_req) {
        continue;
    }
    const parsed_req = JSON.parse(incoming_req.element);
    console.log({ parsed_req });


    if (engine_status != 'ready') {
        const res_data: engineResponse = {
            request_id: parsed_req.request_id,
            status: 'order rejected',
            message: 'Matching engine is not ready to accept orders',
            order_id: '',
            price: 0,
            filled_quantity: 0
        };

        publishclient.lPush(
            `response-queue-${parsed_req.BACKEND_ID}`,
            JSON.stringify(res_data),
        );
    }

    //  do matching engine, check command type, do matching engine stuff and return price and identifier

    //  add engine command type checks, engine request and response type

    //  fills returned with each matched trade
    //depth grouped by price level

    //  lock funds/assets for open limit orders

    // order statuses:
    //open
    //partially_filled
    //filled
    //cancelled

    if (parsed_req.command === 'create-order') {
        console.log('create order called');

        create_order(
            parsed_req.payload,
            parsed_req.BACKEND_ID,
            parsed_req.request_id,
        );
    } else if (parsed_req.command === 'cancel-order') {
        cancel_order(
            parsed_req.payload,
            parsed_req.BACKEND_ID,
            parsed_req.request_id,
        );
    } else if (parsed_req.command === 'get-order') {
        get_order(parsed_req.payload, parsed_req.BACKEND_ID, parsed_req.request_id);
    } else if (parsed_req.command === 'get-balance') {
        get_balance(
            parsed_req.payload,
            parsed_req.BACKEND_ID,
            parsed_req.request_id,
        );
    } else if (parsed_req.command === 'get-depth') {
        get_depth(parsed_req.payload, parsed_req.BACKEND_ID, parsed_req.request_id);
    } else if (parsed_req.command === 'create-asset') {
        create_asset(
            parsed_req.payload,
            parsed_req.BACKEND_ID,
            parsed_req.request_id,
        );
    }
}
