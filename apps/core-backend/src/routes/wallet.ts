import expres from "express";
import { ZodError } from "zod";
//import { prisma } from "../../lib/prisma";
import { prisma } from "database";

const router = expres.Router();

//user
//balance , asset balance
//onramp , offramp

router.post('/api/wallet/onramp', async (req, res) => {
    const { currency, amount } = req.body;
    //increase usd amount

    //call onramp service and add amount to user wallet
    console.log('on ramp called');
    const user_id = req.user;
    console.log({ user_id });

    if (!user_id) {
        return;
    }
    try {
        const assets = await prisma.asset_balance.findMany({
            where: {
                user_id: user_id
            }
        });

        console.log({ assets });
        const primary_ast = await prisma.asset.findFirst({
            where: {
                symbol: currency.toUpperCase()
            }
        });
        console.log({ primary_ast });
        if (!primary_ast) {
            return res.status(404).json({ message: "Currency not supported" })
        }

        //if (assets.length == 0) {
        const all_ast = await prisma.asset.findMany();
        console.log({ all_ast });

        for (let i = 0; i < all_ast.length; i++) {
            if (all_ast[i].symbol == currency.toUpperCase()) {

                //await prisma.asset_balance.create({
                //    data: {
                //        balance: amount * all_ast[i].decimals,
                //        locked_balance: 0,
                //        assetId: primary_ast?.id,
                //        user_id: user_id
                //    }
                //});

                await prisma.asset_balance.upsert({
                    where: {
                        user_id_assetId: {
                            user_id: user_id,
                            assetId: primary_ast.id
                        }
                    },
                    create: {
                        balance: amount * all_ast[i].decimals,
                        locked_balance: 0,
                        assetId: primary_ast?.id,
                        user_id: user_id
                    },
                    update: {
                        balance: {
                            increment: amount * all_ast[i].decimals
                        }
                    }
                })

            } else {
                //await prisma.asset_balance.create({
                //    data: {
                //        balance: 0,
                //        locked_balance: 0,
                //        assetId: all_ast[i].id,
                //        user_id: user_id
                //    }
                //});

                await prisma.asset_balance.upsert({
                    where: {
                        user_id_assetId: {
                            user_id: user_id,
                            assetId: all_ast[i].id
                        }
                    },
                    create: {
                        balance: 0,
                        locked_balance: 0,
                        assetId: all_ast[i].id,
                        user_id: user_id
                    },

                    update: {
                        balance: {
                            increment: 0
                        },
                        locked_balance: {
                            increment: 0
                        }
                    }
                })
            }
        }

        //}
        //else {
        //    await prisma.asset_balance.update({
        //        where: {
        //            user_id_assetId: {
        //                user_id: user_id,
        //                assetId: primary_ast.id
        //            }
        //        },
        //        data: {
        //            balance: {
        //                increment: amount
        //            }
        //        }
        //    });
        //}
        res.json({ message: "Wallet funded successfully", currency, amount })

    } catch (error) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }

});

router.post('/api/wallet/offramp', async (req, res) => {

    try {
        //decrease usd

        //call offramp service and add amount to user wallet
        const { currency, amount } = req.body;
        //decrease usd amount

        console.log('offramp called');
        const user_id = req.user;
        console.log({ user_id });

        if (!user_id) {
            return;
        }
        const primary_ast = await prisma.asset.findUnique({
            where: {
                symbol: currency.toUpperCase()
            }
        });
        console.log({ primary_ast });
        if (!primary_ast) {
            return res.status(404).json({ message: "Currency not supported" })
        }

        //call offramp service

        const wallet = await prisma.asset_balance.update({
            where: {
                user_id_assetId: {
                    user_id: user_id,
                    assetId: primary_ast.id
                }
            }, data: {
                balance: {
                    decrement: amount
                }
            }
        });

        console.log({ wallet });
        res.json({ message: "Fund withdrawn successfully", currency, amount })

    } catch (error) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get('/api/wallet/balance', async (req, res) => {
    //usd and other asset balance
    //todo
    //  sends get-user-balance to engine
    //  include usd and all assets balance
    const user_id = req.user;
    console.log({ user_id });

    if (!user_id) {
        return;
    }
    try {
        const ast_balances = [];
        const all_ast = await prisma.asset.findMany();
        console.log({ all_ast });

        for (let i = 0; i < all_ast.length; i++) {
            const ast = await prisma.asset_balance.findUnique({
                where: {
                    user_id_assetId: {
                        assetId: all_ast[i].id,
                        user_id: user_id
                    }
                }
            });

            ast_balances.push({
                asset: all_ast[i].name,
                available: ast?.balance,
                locked: ast?.locked_balance
            });
        }
        res.json({ message: "Wallet and Asset fetched successfully", ast_balances })

    } catch (error) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

export default router;