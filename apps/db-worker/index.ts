import { createClient } from "redis";
import { prisma } from "database";
import { priceToBigInt18 } from "shared-types";

const client = createClient();

client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

client.connect();
console.log('Connected');

const leverageclient = createClient();

leverageclient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

leverageclient.connect();
console.log('leverage Connected');

const leveragePubclient = createClient();

leveragePubclient.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

leveragePubclient.connect();
console.log('leveragePubclient Connected');

const STREAM_NAME = 'index-prices:events';
const GROUP_NAME = 'index-prices_processors';
const CONSUMER_NAME = `worker-${process.pid}`;



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
    } catch (err) {

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

        const [{ messages }] = response;

        for (const message of messages) {
            const { id, message: data } = message;

            console.log({ message });
            console.log(`[Consumer] Processing message ${id}:`, data);

            const ast = await find_asset(data.symbol);

            console.log({ ast });
            if (!ast) {
                return
            }

            const index_price = priceToBigInt18(data.price);
            const mark_price = ((index_price + ast.last_traded_price) / BigInt(2))

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

while (1) {

    await initializeStreamAndGroup();

    setInterval(async () => {
        await getIndexPrice()
    }, 5 * 60 * 1000)

    const settlement_req = await client.brPop('settlement-queue', 2);

    const leverage_req = await leverageclient.brPop('leverage-db-queue', 2);
    console.log({ leverage_req });

    if (!settlement_req && !leverage_req) {
        continue;
    }

    let parsed_settlement_req;
    let parsed_leverage_req;

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

    if (parsed_settlement_req) {
        const asts = parsed_settlement_req.symbol.split(/_/);
        console.log({ asts });

        //const base_ast = await find_asset(asts[0]);
        //const quote_ast = await find_asset(asts[1]);

        const base_ast = await prisma.asset.findFirstOrThrow({
            where: {
                symbol: asts[0]
            }
        })

        const quote_ast = await prisma.asset.findFirstOrThrow({
            where: {
                symbol: asts[1]
            }
        })
        console.log({ base_ast, quote_ast });


        if (!base_ast || !quote_ast) {
            //return;
            //invalid asset
            continue;
        }
        const required_bal = parsed_settlement_req.price * parsed_settlement_req.quantity;


        if (parsed_settlement_req.filled_quantity > 0) {
            //some order were filled, calculate and update asset balances
            console.log("update asset balance");
            //i have to  update for base and quote asset balance for both buy and sell side


            const buy_price = quote_ast.decimals * parsed_settlement_req.filled_quantity * parsed_settlement_req.price;

            console.log({ buy_price });

            const buy_user_quote = await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: parsed_settlement_req.buy_user_id,
                        assetId: quote_ast?.id
                    }
                },
                data: {
                    locked_balance: {
                        decrement: BigInt(buy_price)
                    },

                }
            })

            console.log({ buy_user_quote });


            const base_increment_buy = base_ast.decimals * parsed_settlement_req.filled_quantity;

            console.log({ base_increment_buy });


            const buy_user_base = await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: parsed_settlement_req.buy_user_id,
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


            const ask_price = base_ast.decimals * parsed_settlement_req.filled_quantity;

            console.log({ ask_price });


            const sell_user_base = await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: parsed_settlement_req.sell_user_Id,
                        assetId: base_ast?.id
                    }
                },
                data: {
                    locked_balance: {
                        decrement: ask_price
                    },

                }
            })
            console.log({ sell_user_base });

            const quote_bal = quote_ast.decimals * parsed_settlement_req.price * parsed_settlement_req.filled_quantity;

            console.log({ quote_bal });


            const sell_user_quote = await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: parsed_settlement_req.sell_user_Id,
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
        }
        else if (parsed_settlement_req.status == 'order cancelled') {
            //order cancel, caculated and update asset balances

            //if it's buy order then decrease user's quote asset balance and increase balance

            //if it's sell order then decrease user's base asset balnce and increase base asset balance

            if (parsed_settlement_req.side == "buy") {

                await prisma.asset_balance.update({
                    where: {
                        user_id_assetId: {
                            user_id: parsed_settlement_req.user_id,
                            assetId: quote_ast?.id
                        }
                    },
                    data: {
                        locked_balance: {
                            decrement: quote_ast.decimals * parsed_settlement_req.quantity * parsed_settlement_req.price
                        },
                        balance: {
                            increment: quote_ast.decimals * parsed_settlement_req.quantity * parsed_settlement_req.price
                        }
                    }
                })
            } else if (parsed_settlement_req.side == 'sell') {
                await prisma.asset_balance.update({
                    where: {
                        user_id_assetId: {
                            user_id: parsed_settlement_req.user_id,
                            assetId: base_ast?.id
                        }
                    },
                    data: {
                        locked_balance: {
                            decrement: base_ast.decimals * parsed_settlement_req.quantity
                        },
                        balance: {
                            increment: base_ast.decimals * parsed_settlement_req.quantity
                        }
                    }
                })
            }
        }
        console.log("asset_balance updated");
    }

    if (parsed_leverage_req) {
        await createORUpdateLeverage(parsed_leverage_req);
    }

}

