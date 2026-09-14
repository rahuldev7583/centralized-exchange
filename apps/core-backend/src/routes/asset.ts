import express from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { Asset, Market } from '../types/user';
import { ZodError } from 'zod';
//import { prisma } from '../../lib/prisma';
import { prisma } from "database";
//import { MarketType } from '../../generated/prisma/enums';
import { MarketType } from 'database';

const router = express();

//admin
//asset add/edit
//marekt add/edit


router.post('/api/exchange/asset/add', adminAuthMiddleware, async (req, res) => {
    try {
        const asset_req = req.body;
        console.log({ asset_req });

        const parsedAsset = Asset.parse(asset_req);

        const existing_asset = await prisma.asset.findFirst({
            where: {
                OR: [
                    {
                        symbol: parsedAsset.symbol,
                    },
                    {
                        name: parsedAsset.name
                    }
                ]
            },
        });

        if (existing_asset) {
            return res.status(404).json({ message: 'Asset already exists' });
        }

        const admin = req.user;
        console.log({ admin });

        const new_asset = await prisma.asset.create({
            data: {
                name: parsedAsset.name,
                symbol: parsedAsset.symbol,
                decimals: parsedAsset.decimals,
                adminAdmin_id: admin,
                last_traded_price: 0
            },
        });
        return res.status(201).json({
            message: 'Asset created successfully',
            asset: new_asset.name,
        });

    } catch (error: any) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.put('/api/exchange/asset/edit/:id', adminAuthMiddleware, async (req, res) => {
    try {
        const asset_id = req.params.id;
        console.log({ asset_id });

        const asset_req = req.body;
        console.log({ asset_req });

        const parsedAsset = Asset.parse(asset_req);

        const existing_asset = await prisma.asset.findFirst({
            where: {
                id: Number(asset_id)
            },
        });

        if (!existing_asset) {
            return res.status(404).json({ message: 'Asset does not exists' });
        }
        console.log({ existing_asset });

        const admin = req.user;

        console.log({ admin });

        const new_asset = await prisma.asset.update({
            where: {
                id: Number(asset_id)
            },
            data: {
                name: parsedAsset.name,
                symbol: parsedAsset.symbol,
                decimals: parsedAsset.decimals,
                adminAdmin_id: admin
            }
        })

        return res.status(200).json({
            message: 'Asset Updated successfully',
            asset: new_asset.name,
        });

    } catch (error: any) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || error });
    }

});

router.post('/api/exchange/market/add', adminAuthMiddleware, async (req, res) => {
    try {
        const market_req: any = req.body;
        console.log({ market_req });

        const parsedMarket = Market.parse(market_req);
        console.log({ parsedMarket });

        const base_ast = await prisma.asset.findFirst({
            where: {
                symbol: parsedMarket.base_asset_symbol
            }
        });

        console.log({ base_ast });

        const quote_ast = await prisma.asset.findFirst({
            where: {
                symbol: parsedMarket.quote_asset_symbol
            }
        });


        if (!base_ast || !quote_ast) {
            return res.status(404).json({ message: 'Base Asset or Quote Asset not valid' });
        }
        const existing_market = await prisma.market.findFirst({
            where: {
                base_asset_id: base_ast?.id,
                quote_asset_id: quote_ast?.id,
                type: parsedMarket.type[0].toUpperCase() + parsedMarket.type.slice(1).toLowerCase()
            },
        });

        if (existing_market) {
            return res.status(404).json({ message: 'Market already exists' });
        }

        const admin = req.user;

        const type: MarketType = parsedMarket.type.toLowerCase() == "spot" ? "Spot" : "Perp"

        const new_market = await prisma.market.create({
            data: {
                name: parsedMarket.name,
                symbol: parsedMarket.symbol,
                type: type,
                quote_asset_id: quote_ast?.id,
                base_asset_id: base_ast?.id,
                adminAdmin_id: admin
            },
        });
        return res.status(201).json({
            message: 'Market created successfully',
            asset: new_market.name,
        });

    } catch (error: any) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get('/api/exchange/markets', async (req, res) => {
    try {
        const existing_markets = await prisma.market.findMany({});
        if (!existing_markets) {
            return res.status(404).json({ message: 'Market not found' });
        }
        return res.status(201).json({
            message: 'Market fetched successfully',
            markets: existing_markets
        });

    } catch (error: any) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get("/api/tickers/:symbol", async (req, res) => {
    //todo
    // last price, 24h change %, 24h volume, best bid/ask. Needs last_traded_price (exists on Asset) + a small agg over recent fills.
})

router.get("/api/get/tickers", async (req, res) => {
    //todo
    // last price, 24h change %, 24h volume, best bid/ask. Needs last_traded_price (exists on Asset) + a small agg over recent fills.
})

//router.get("/api/market/candles/:symbol?interval=1m|5m|1h|1d&from&to&limit", async (req, res) => {
//    //todo
//    // OHLCV for TradingView. Backed by TimescaleDB
//})


router.get("/api/history/balances", async (req, res) => {
    //OPT
    //todo
    //deposits/withdrawals/trades/transfers. 
    // No Transaction/BalanceHistory table exists. 
    // Add one, written on onramp, offramp, and settlement.
})

export default router;