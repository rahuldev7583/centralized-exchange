import { createClient } from "redis";
import { prisma } from "database";

const client = createClient();

client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

client.connect();
console.log('Connected');

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

while (1) {
    const incoming_req = await client.brPop('settlement-queue', 2);

    if (!incoming_req) {
        continue;
    }
    const parsed_req = JSON.parse(incoming_req.element);
    console.log({ parsed_req });

    //symbol (base asset, quote asset), type, side, quantity, price, user

    //fill quantity



    // i have to update both buy and sell of match or fill trade, every match trade will have both sides, so i have to update the asset balance of each 

    //update both asked user balance and buy user balance
    //depend on order side buy/sell increase/decrease usd/asset balance/locked balance

    //decrease the buyer quote locked balance (usd)
    //decrease the seller base asset locked balance (btc/eth)

    //increase the buyer base asset balance (btc/eth)
    //increase the seller quote balance (usd)

    if (parsed_req) {
        const asts = parsed_req.symbol.split(/_/);
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
        const required_bal = parsed_req.price * parsed_req.quantity;


        if (parsed_req.filled_quantity > 0) {
            //some order were filled, calculate and update asset balances
            console.log("update asset balance");
            //i have to  update for base and quote asset balance for both buy and sell side


            const buy_price = quote_ast.decimals * parsed_req.filled_quantity * parsed_req.price;

            console.log({ buy_price });

            const buy_user_quote = await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: parsed_req.buy_user_id,
                        assetId: quote_ast?.id
                    }
                },
                data: {
                    locked_balance: {
                        decrement: buy_price
                    },

                }
            })

            console.log({ buy_user_quote });


            const base_increment_buy = base_ast.decimals * parsed_req.filled_quantity;

            console.log({ base_increment_buy });


            const buy_user_base = await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: parsed_req.buy_user_id,
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


            const ask_price = base_ast.decimals * parsed_req.filled_quantity;

            console.log({ ask_price });


            const sell_user_base = await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: parsed_req.sell_user_Id,
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

            const quote_bal = quote_ast.decimals * parsed_req.price * parsed_req.filled_quantity;

            console.log({ quote_bal });


            const sell_user_quote = await prisma.asset_balance.update({
                where: {
                    user_id_assetId: {
                        user_id: parsed_req.sell_user_Id,
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
        else if (parsed_req.status == 'order cancelled') {
            //order cancel, caculated and update asset balances

            //if it's buy order then decrease user's quote asset balance and increase balance

            //if it's sell order then decrease user's base asset balnce and increase base asset balance

            if (parsed_req.side == "buy") {

                await prisma.asset_balance.update({
                    where: {
                        user_id_assetId: {
                            user_id: parsed_req.user_id,
                            assetId: quote_ast?.id
                        }
                    },
                    data: {
                        locked_balance: {
                            decrement: quote_ast.decimals * parsed_req.quantity * parsed_req.price
                        },
                        balance: {
                            increment: quote_ast.decimals * parsed_req.quantity * parsed_req.price
                        }
                    }
                })
            } else if (parsed_req.side == 'sell') {
                await prisma.asset_balance.update({
                    where: {
                        user_id_assetId: {
                            user_id: parsed_req.user_id,
                            assetId: base_ast?.id
                        }
                    },
                    data: {
                        locked_balance: {
                            decrement: base_ast.decimals * parsed_req.quantity
                        },
                        balance: {
                            increment: base_ast.decimals * parsed_req.quantity
                        }
                    }
                })
            }
        }
        console.log("asset_balance updated");
    }
}

