import { createClient } from "redis";
import { Prisma, prisma } from "database";
import { scaledDecimal, scheduleUTC } from "shared-types";

if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not set");
}

const client = createClient({ url: process.env.REDIS_URL });

client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const leverageclient = createClient({ url: process.env.REDIS_URL });
leverageclient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const leveragePubclient = createClient({ url: process.env.REDIS_URL });
leveragePubclient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const fundingClient = createClient({ url: process.env.REDIS_URL });

fundingClient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

const STREAM_NAME = 'index-prices:events';
const GROUP_NAME = 'index-prices-processors';
const CONSUMER_NAME = `worker-${process.pid}`;

// settlement-queue => client => listen settlement and fills from matching engine

//leverage-db-queue => leverageclient => to listen leverage update from risk engine

// leverage-res-queue => leveragePubClient => send back leverage update to api


export const find_asset = async (asset: string) => {
    console.log("called find asset");

    try {
        console.log("try ");
        console.log({ asset });

        const ast = await prisma.asset.findFirstOrThrow({
            where: {
                symbol: asset
            }
        })

        console.log({ ast });


        return ast ? ast : null;
    } catch (error) {
        return null
    }
}

async function initializeStreamAndGroup() {

    try {
        await client.xGroupCreate(STREAM_NAME, GROUP_NAME, '0', { MKSTREAM: true });
        console.log(`[Setup] Consumer group '${GROUP_NAME}' created.`);
    } catch (err: any) {

        if (err.message.includes('BUSYGROUP')) {
            //console.log(`[Setup] Consumer group '${GROUP_NAME}' already exists. Proceeding...`);
        } else {
            throw err;
        }
    }
}

const getIndexPrice = async () => {
    console.log("get index price called");

    try {
        const response = await client.xReadGroup(

            GROUP_NAME,
            CONSUMER_NAME,
            { key: STREAM_NAME, id: '>' },
            { COUNT: 1, BLOCK: 5000 }
        );

        //console.log({ response });

        if (!response || response.length === 0) return;

        const [{ messages }]: any = response;

        for (const message of messages) {
            const { id, message: data } = message;

            console.log({ message });
            console.log(`[Consumer] Processing message ${id}:`, data);

            const ast = await find_asset(data.symbol);

            console.log({ ast });
            if (!ast) {
                return
            }

            //const index_price = priceToBigInt18(data.price);
            const index_price = data.price;
            const mark_price = ((Number(index_price) + Number(ast.last_traded_price)) / 2);

            console.log({ index_price, mark_price });

            await prisma.assetPrice.create({
                data: {
                    symbol: ast?.symbol,
                    mark_price: index_price,
                    index_price: mark_price,
                    assetId: ast.id,
                    timestamp: new Date(Number(data.timestamp))
                }
            })
            console.log("Index and Mark price updated");

            await client.xAck(STREAM_NAME, GROUP_NAME, id);
            console.log(`[Consumer] Acknowledged message ${id}`);

        }
    } catch (error) {
        console.error('[Consumer Error]', error);

        await new Promise(resolve => setTimeout(resolve, 2000));

    }
}

const createORUpdateLeverage = async (data: any) => {
    console.log({ data });
    try {

        if (!data.payload.user_id || !data.payload.leverage) {
            return;
        }
        await prisma.leverage.upsert({
            create: {
                user_id: data.payload.user_id,
                limit: data.payload.leverage
            }, update: {
                limit: data.payload.leverage
            }, where: {
                user_id: data.payload.user_id
            }
        })

        const res_data = {
            payload: data.payload,
            request_id: data.request_id,
            status: 'Request accepted',
            message: 'leverage updated successfully',
        };

        leveragePubclient.lPush(
            `leverage-res-queue`,
            JSON.stringify(res_data),
        );

        return;
    } catch (error) {
        console.log({ error });

    }
}

const settleFunding = async (payload: any) => {
    try {
        const asts = payload.fill.symbol.split(/_/);
        console.log({ asts });

        const base_ast = await prisma.asset.findUnique({
            where: {
                symbol: asts[0]
            }
        })
        const quote_ast = await prisma.asset.findUnique({
            where: {
                symbol: asts[1]
            }
        })
        if (!base_ast || !quote_ast) {
            return;
        }

        const funding_fee = payload.funding_fee;
        const funding_rate = payload.funding_rate;
        const fill = payload.fill;

        if (Number(funding_rate) > 0) {
            //long of this postion will pay short
            //decrease the usdc from buy user and increase of sell user

            await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: Number(fill.buy_user_id),
                        assetId: quote_ast?.id
                    }
                },
                data: {
                    balance: {
                        decrement: funding_fee
                    }
                }
            })

            await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: Number(fill.sell_user_id),
                        assetId: quote_ast?.id
                    }
                },
                data: {
                    balance: {
                        increment: funding_fee
                    }
                }
            })

            await prisma.fundingFee.create({
                data: {
                    user_id: Number(fill.buy_user_id),
                    symbol: fill.symbol,
                    side: 'long',
                    funding_rate: funding_rate,
                    funding_fee: -funding_fee
                }
            })

            await prisma.fundingFee.create({
                data: {
                    user_id: Number(fill.sell_user_id),
                    symbol: fill.symbol,
                    side: 'short',
                    funding_rate: funding_rate,
                    funding_fee: funding_fee
                }
            })
        } else if (Number(funding_rate) < 0) {
            //short of position wil pay long

            //decrease the usdc from sell user and increase of sell user

            await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: Number(fill.sell_user_id),
                        assetId: quote_ast?.id
                    }
                },
                data: {
                    balance: {
                        decrement: funding_fee
                    }
                }
            })

            await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: Number(fill.buy_user_id),
                        assetId: quote_ast?.id
                    }
                },
                data: {
                    balance: {
                        increment: funding_fee
                    }
                }
            })

            await prisma.fundingFee.create({
                data: {
                    user_id: Number(fill.sell_user_id),
                    symbol: fill.symbol,
                    side: 'short',
                    funding_rate: funding_rate,
                    funding_fee: -funding_fee
                }
            })

            await prisma.fundingFee.create({
                data: {
                    user_id: Number(fill.buy_user_id),
                    symbol: fill.symbol,
                    side: 'long',
                    funding_rate: funding_rate,
                    funding_fee: funding_fee
                }
            })
        }

    } catch (error) {
        console.log({ error });

    }
    console.log("Funding fee collected and transfered");

}

await Promise.all([
    client.connect(),
    leverageclient.connect(),
    leveragePubclient.connect(),
    fundingClient.connect()
]);

while (1) {

    console.log("All redis services connected successfully");

    await initializeStreamAndGroup();

    scheduleUTC(async () => {
        await getIndexPrice()
    }, 1 * 60 * 1000)

    const settlement_req = await client.brPop('settlement-queue', 2);

    const leverage_req = await leverageclient.brPop('leverage-db-queue', 2);
    console.log({ leverage_req });

    const funding_req = await fundingClient.brPop('funding-to-db-queue', 2);
    console.log({ funding_req });

    if (!settlement_req && !leverage_req && !funding_req) {
        continue;
    }
    try {

        let parsed_settlement_req;
        let parsed_leverage_req;
        let parsed_funding_req;

        if (funding_req) {
            parsed_funding_req = JSON.parse(funding_req.element);
            console.log({ parsed_funding_req });
        }

        if (settlement_req) {
            parsed_settlement_req = JSON.parse(settlement_req.element);
            console.log({ parsed_settlement_req });
        }

        if (leverage_req) {
            parsed_leverage_req = JSON.parse(leverage_req.element);
            console.log({ parsed_leverage_req });
        }



        //symbol (base asset, quote asset), type, side, quantity, price, user

        //fill quantity



        // i have to update both buy and sell of match or fill trade, every match trade will have both sides, so i have to update the asset balance of each 

        //update both asked user balance and buy user balance
        //depend on order side buy/sell increase/decrease usd/asset balance/locked balance

        //decrease the buyer quote locked balance (usd)
        //decrease the seller base asset locked balance (btc/eth)

        //increase the buyer base asset balance (btc/eth)
        //increase the seller quote balance (usd)

        if (parsed_funding_req) {
            const payload = parsed_funding_req.payload;
            console.log({ payload });
            await settleFunding(payload);
        }

        if (parsed_settlement_req) {
            const asts = parsed_settlement_req?.payload?.symbol.split(/_/);
            console.log({ asts });

            //const base_ast = await find_asset(asts[0]);
            //const quote_ast = await find_asset(asts[1]);

            const base_ast = await prisma.asset.findFirstOrThrow({
                where: {
                    symbol: asts[0]
                }
            });

            const quote_ast = await prisma.asset.findFirstOrThrow({
                where: {
                    symbol: asts[1]
                }
            });

            const market = await prisma.market.findFirst({
                where: {
                    symbol: parsed_settlement_req.fill?.symbol || parsed_settlement_req.payload?.symbol
                }
            })


            if (!base_ast || !quote_ast) {
                //return;
                //invalid asset
                continue;
            }


            if (parsed_settlement_req.command == 'create-fill') {
                //some order were filled, calculate and update asset balances
                console.log("update asset balance");
                //i have to  update for base and quote asset balance for both buy and sell side

                const fill = parsed_settlement_req.fill;
                const payload = parsed_settlement_req.payload;

                if (parsed_settlement_req.request_type == 'perp') {
                    // //create long and short position row, if user positin already exit for that market then increase by weightated

                    //need initial margin, market id, user_id, side, quantity, entry price, leverage

                    const long_position = await prisma.position.findFirst({
                        where: {
                            user_id: fill.buy_user_id,
                            market_id: market?.id
                        }
                    });

                    console.log({ long_position });

                    if (!long_position) {
                        const long = {
                            id: crypto.randomUUID(),
                            user_id: fill.buy_user_id,
                            market_id: market?.id as number,
                            quantity: fill.filled_quantity,
                            side: "long",
                            entryPrice: fill.price,
                            initial_margin: payload.initial_margin,
                            leverage: 1,
                        };
                        const created_long = await prisma.position.create({
                            data: long
                        });
                        console.log({ created_long });
                    } else {
                        //increase the position by weighted average
                        const total_quantity = new Prisma.Decimal(long_position.quantity).add(new Prisma.Decimal(fill.filled_quantity));

                        const weighted_entry_price = new Prisma.Decimal(long_position.entryPrice).mul(new Prisma.Decimal(long_position.quantity)).add(new Prisma.Decimal(fill.price).mul(new Prisma.Decimal(fill.filled_quantity))).div(total_quantity);

                        const updated_long = await prisma.position.update({
                            where: {
                                id: long_position.id
                            },
                            data: {
                                quantity: total_quantity,
                                entryPrice: weighted_entry_price,
                                initial_margin: new Prisma.Decimal(long_position.initial_margin).add(payload.initial_margin),
                            }
                        });
                        console.log({ updated_long });
                    }

                    const short_position = await prisma.position.findFirst({
                        where: {
                            user_id: fill.sell_user_id,
                            market_id: market?.id
                        }
                    });

                    console.log({ short_position });

                    if (!short_position) {
                        const short = {
                            id: crypto.randomUUID(),
                            user_id: fill.sell_user_id,
                            market_id: market?.id as number,
                            quantity: fill.filled_quantity,
                            side: "short",
                            entryPrice: fill.price,
                            initial_margin: payload.initial_margin,
                            leverage: 1,
                        };
                        const created_short = await prisma.position.create({
                            data: short
                        });
                        console.log({ created_short });
                    } else {
                        //increase the position by weighted average
                        const total_quantity = new Prisma.Decimal(short_position.quantity).add(new Prisma.Decimal(fill.filled_quantity));

                        const weighted_entry_price = new Prisma.Decimal(short_position.entryPrice).mul(new Prisma.Decimal(short_position.quantity)).add(new Prisma.Decimal(fill.price).mul(new Prisma.Decimal(fill.filled_quantity))).div(total_quantity);

                        const updated_short = await prisma.position.update({
                            where: {
                                id: short_position.id
                            },
                            data: {
                                quantity: total_quantity,
                                entryPrice: weighted_entry_price,
                                initial_margin: new Prisma.Decimal(short_position.initial_margin).add(payload.initial_margin),
                            }
                        });
                        console.log({ updated_short });
                    }


                } else {

                    const mkt = await prisma.market.findFirst({
                        where: {
                            symbol: parsed_settlement_req.payload.symbol
                        }
                    });

                    if (!mkt) {
                        console.log("market not found");

                    }
                    const buyer_quote = await prisma.asset_balance.findFirst({
                        where: {
                            user_id: parsed_settlement_req.fill.buy_user_id,
                            assetId: quote_ast?.id
                        }
                    });

                    const buy_price = scaledDecimal(parsed_settlement_req.fill.filled_quantity * parsed_settlement_req.fill.price, Number(quote_ast.decimals));

                    console.log({ buy_price });

                    const buy_increment = 0;

                    const buy_user_quote = await prisma.asset_balance.update({
                        where: {
                            user_id_assetId: {
                                user_id: parsed_settlement_req.fill.buy_user_id,
                                assetId: quote_ast?.id
                            }
                        },
                        data: {
                            locked_balance: {
                                decrement: buy_price
                            },
                            balance: {
                                increment: buy_increment
                            }
                        }
                    })

                    console.log({ buy_user_quote });

                    const base_increment_buy = scaledDecimal(parsed_settlement_req.fill.filled_quantity, Number(base_ast.decimals));

                    const buy_user_base = await prisma.asset_balance.update({
                        where: {
                            user_id_assetId: {
                                user_id: parsed_settlement_req.fill.buy_user_id,
                                assetId: base_ast?.id
                            }
                        },
                        data: {
                            balance: {
                                increment: base_increment_buy
                            },

                        }
                    })
                    console.log({ buy_user_base });

                    const ask_price = scaledDecimal(parsed_settlement_req.fill.filled_quantity, Number(base_ast.decimals));

                    console.log({ ask_price });

                    const seller_base = await prisma.asset_balance.findFirst({
                        where: {
                            user_id: parsed_settlement_req.fill.sell_user_id,
                            assetId: base_ast?.id
                        }
                    });

                    const increment_sell_base = 0;

                    const sell_user_base = await prisma.asset_balance.update({
                        where: {
                            user_id_assetId: {
                                user_id: parsed_settlement_req.fill.sell_user_id,
                                assetId: base_ast?.id
                            }
                        },
                        data: {
                            locked_balance: {
                                decrement: ask_price
                            },
                            balance: {
                                increment: increment_sell_base
                            }
                        }
                    });
                    console.log({ sell_user_base });

                    const quote_bal = scaledDecimal(parsed_settlement_req.fill.price * parsed_settlement_req.fill.filled_quantity, Number(quote_ast.decimals));

                    console.log({ quote_bal });

                    const sell_user_quote = await prisma.asset_balance.update({
                        where: {
                            user_id_assetId: {
                                user_id: parsed_settlement_req.fill.sell_user_id,
                                assetId: quote_ast?.id
                            }
                        },
                        data: {
                            balance: {
                                increment: quote_bal
                            }

                        }
                    })
                    console.log({ sell_user_quote });

                    await prisma.asset.update({
                        where: {
                            id: base_ast.id
                        },
                        data: {
                            last_traded_price: scaledDecimal(parsed_settlement_req.fill.price, Number(base_ast.decimals))
                        }
                    })

                    const fill_msg = parsed_settlement_req.payload.quantity == parsed_settlement_req.fill.filled_quantity ? "filled" : "partially filled";
                    //fix this, both buy and sell side can have differenet status of fill

                    const payload = parsed_settlement_req.payload;

                    await prisma.order.upsert({
                        where: { id: parsed_settlement_req.order_id },
                        update: {
                            filled: { increment: parsed_settlement_req.fill.filled_quantity },
                            status: fill_msg,
                        },
                        create: {
                            type: payload.type,
                            quantity: payload.quantity,
                            price: payload.price ?? parsed_settlement_req.fill.price,
                            side: payload.side,
                            user_id: payload.user_id,
                            market_id: mkt?.id,
                            entry_price: 0,
                            filled: parsed_settlement_req.fill.filled_quantity,
                            status: fill_msg,
                            initial_margin: 0,
                            id: parsed_settlement_req.order_id
                        }
                    });
                    console.log("order created successfully");

                    await prisma.fill.create({
                        data: {
                            type: parsed_settlement_req.fill.type,
                            price: parsed_settlement_req.fill.price,
                            quantity: parsed_settlement_req.fill.filled_quantity,
                            status: fill_msg,

                            ask_order_id: parsed_settlement_req.fill.sell_order_id,
                            bid_order_id: parsed_settlement_req.fill.buy_order_id,



                            sell_user_id: parsed_settlement_req.fill.sell_user_id,
                            buy_user_id: parsed_settlement_req.fill.buy_user_id,

                            symbol: parsed_settlement_req.fill.symbol,
                            id: parsed_settlement_req.fill.fill_id
                        }
                    })

                    await prisma.order.update({
                        where: {
                            id: parsed_settlement_req.fill.sell_order_id,
                            user_id: parsed_settlement_req.fill.sell_user_id
                        }, data: {
                            status: fill_msg,
                            filled: parsed_settlement_req.fill.filled_quantity
                        }
                    });

                    await prisma.order.update({
                        where: {
                            id: parsed_settlement_req.fill.buy_order_id,
                            user_id: parsed_settlement_req.fill.buy_user_id
                        }, data: {
                            status: fill_msg,
                            filled: parsed_settlement_req.fill.filled_quantity
                        }
                    });

                    //order type => buy or sell

                    //if perp order => get all the positions of buyer and seller

                    //if buyer position is long, increasing the position
                    //else closing a short : Realize PNL => update user quote balance either profit or loss
                    //do similarly for seller

                    //loop over only active postion , shared_fill is historic data
                    //margin balance is Total Collateral Wallet Balance + uPnL
                }
            }
            else if (parsed_settlement_req.command == 'cancel-order') {
                //order cancel, caculated and update asset balances

                //if it's buy order then decrease user's quote asset balance and increase balance

                //if it's sell order then decrease user's base asset balnce and increase base asset balance

                try {
                    if (parsed_settlement_req.side == "buy") {

                        const quote_price = scaledDecimal(parsed_settlement_req.quantity * parsed_settlement_req.price, Number(quote_ast.decimals));

                        await prisma.asset_balance.update({
                            where: {
                                user_id_assetId: {
                                    user_id: parsed_settlement_req.user_id,
                                    assetId: quote_ast?.id
                                }
                            },
                            data: {
                                locked_balance: {
                                    decrement: quote_price
                                },
                                balance: {
                                    increment: quote_price
                                }
                            }
                        })
                    } else if (parsed_settlement_req.side == 'sell') {
                        const base_price = scaledDecimal(parsed_settlement_req.quantity, Number(base_ast.decimals));

                        await prisma.asset_balance.update({
                            where: {
                                user_id_assetId: {
                                    user_id: parsed_settlement_req.user_id,
                                    assetId: base_ast?.id
                                }
                            },
                            data: {
                                locked_balance: {
                                    decrement: base_price
                                },
                                balance: {
                                    increment: base_price
                                }
                            }
                        })
                    }
                    console.log('cancel_order');

                    await prisma.order.update({
                        where: {
                            id: parsed_settlement_req.order_id,
                            user_id: parsed_settlement_req.user_id
                        }, data: {
                            status: 'cancelled',
                            filled: 0
                        }
                    });
                } catch (error) {
                    console.log({ error });

                }
            } else if (parsed_settlement_req.command == 'create-order') {
                //open orders sitting on the orderbook

                //update db

                const payload = parsed_settlement_req.payload;
                console.log({ payload });

                const mkt = await prisma.market.findFirst({
                    where: {
                        symbol: payload.symbol
                    }
                });

                if (!mkt) {
                    console.log("Market not found");
                    //reject order
                } else {
                    await prisma.order.create({
                        data: {
                            type: payload.type,
                            quantity: payload.quantity,
                            price: payload.price,
                            side: payload.side,
                            user_id: payload.user_id,
                            market_id: mkt?.id,
                            entry_price: 0,
                            filled: 0,
                            status: "open",
                            initial_margin: 0,
                            id: parsed_settlement_req.order_id
                        }
                    });
                    console.log("order created successfully");
                }
            } else if (parsed_settlement_req.command == 'close-position') {
                //closing user => realize PnL, release margin, reduce/delete position
                //counterparty => either create new position or increase existing one by weighted average

                const fill = parsed_settlement_req.fill;
                const payload = parsed_settlement_req.payload;

                console.log({ fill, payload });

                const position = await prisma.position.findFirst({
                    where: {
                        user_id: payload.user_id,
                        market_id: market?.id
                    }
                });

                console.log({ position });

                if (position) {
                    const entry_price = Number(position.entryPrice);
                    const exit_price = Number(fill.price);
                    const close_quantity = Number(fill.filled_quantity);
                    const position_quantity = Number(position.quantity);

                    //realized PnL => long (exit - entry), short (entry - exit)
                    const realized_pnl = position.side == 'long'
                        ? (exit_price - entry_price) * close_quantity
                        : (entry_price - exit_price) * close_quantity;

                    const released_margin = Number(position.initial_margin) * (close_quantity / position_quantity);

                    console.log({ realized_pnl, released_margin });

                    await prisma.asset_balance.update({
                        where: {
                            user_id_assetId: {
                                user_id: payload.user_id,
                                assetId: quote_ast?.id
                            }
                        },
                        data: {
                            balance: {
                                increment: realized_pnl + released_margin
                            },
                            locked_balance: {
                                decrement: released_margin
                            }
                        }
                    });

                    await prisma.balanceHistory.create({
                        data: {
                            user_id: payload.user_id,
                            symbol: quote_ast?.symbol,
                            amount: realized_pnl + released_margin,
                            type: 'trade'
                        }
                    });

                    const remaining_quantity = position_quantity - close_quantity;

                    if (remaining_quantity <= 0) {
                        await prisma.position.delete({
                            where: {
                                id: position.id
                            }
                        });
                    } else {
                        await prisma.position.update({
                            where: {
                                id: position.id
                            },
                            data: {
                                quantity: remaining_quantity,
                                initial_margin: new Prisma.Decimal(Number(position.initial_margin) - released_margin)
                            }
                        });
                    }
                    console.log("position closed");
                }

                //counterparty => create or increase their position
                const counter_user_id = fill.buy_user_id == payload.user_id ? fill.sell_user_id : fill.buy_user_id;
                const counter_side = fill.buy_user_id == payload.user_id ? 'short' : 'long';

                const counter_position = await prisma.position.findFirst({
                    where: {
                        user_id: counter_user_id,
                        market_id: market?.id
                    }
                });

                console.log({ counter_position });

                if (!counter_position) {
                    await prisma.position.create({
                        data: {
                            id: crypto.randomUUID(),
                            user_id: counter_user_id,
                            market_id: market?.id as number,
                            quantity: fill.filled_quantity,
                            side: counter_side,
                            entryPrice: fill.price,
                            initial_margin: payload.initial_margin,
                            leverage: 1,
                        }
                    });
                } else {
                    //increase the position by weighted average
                    const total_quantity = new Prisma.Decimal(counter_position.quantity).add(new Prisma.Decimal(fill.filled_quantity));
                    const weighted_entry_price = new Prisma.Decimal(counter_position.entryPrice).mul(new Prisma.Decimal(counter_position.quantity)).add(new Prisma.Decimal(fill.price).mul(new Prisma.Decimal(fill.filled_quantity))).div(total_quantity);

                    await prisma.position.update({
                        where: {
                            id: counter_position.id
                        },
                        data: {
                            quantity: total_quantity,
                            entryPrice: weighted_entry_price,
                            initial_margin: new Prisma.Decimal(counter_position.initial_margin).add(payload.initial_margin),
                        }
                    });
                }
                console.log("opposite side  position updated");
            }

            console.log("asset_balance updated");
        }

        if (parsed_leverage_req) {
            await createORUpdateLeverage(parsed_leverage_req);
        }
    } catch (error) {
        console.error("settlement processing failed (skipping message)", error);
    }
}
