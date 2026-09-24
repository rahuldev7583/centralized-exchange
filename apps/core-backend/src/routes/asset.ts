import express from 'express';
import { adminAuthMiddleware, userAuthMiddleware } from '../middleware/auth';
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
        return res.status(200).json({
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

router.get('/api/exchange/assets', async (req, res) => {
    try {
        const existing_assets = await prisma.asset.findMany({});
        if (!existing_assets) {
            return res.status(404).json({ message: 'Asset not found' });
        }
        console.log({ existing_assets });

        return res.status(200).json({
            message: 'Asset fetched successfully',
            assets: JSON.stringify(existing_assets, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            )
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
    //last price, 24h change %, 24h volume. last_traded_price (exists on Asset) + agg over recent fills
    try {
        const symbol = req.params.symbol;
        console.log({ symbol });

        const asset = await prisma.asset.findUnique({
            where: {
                symbol: symbol
            }
        });

        if (!asset) {
            return res.status(404).json({ message: 'Asset not found' });
        }

        const now = new Date();
        const twenty_four_hours_ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const fills = await prisma.fill.findMany({
            where: {
                symbol: symbol,
                created_at: {
                    gte: twenty_four_hours_ago
                }
            },
            orderBy: {
                created_at: 'asc'
            }
        });

        const last_price = Number(asset.last_traded_price);
        const volume_24h = fills.reduce((sum, f) => sum + Number(f.price) * f.quantity, 0);
        const open_price = fills.length ? Number(fills[0].price) : last_price;
        const change_24h = open_price ? ((last_price - open_price) / open_price) * 100 : 0;

        console.log({ last_price, change_24h, volume_24h });

        res.json({
            message: 'Ticker fetched successfully',
            ticker: {
                symbol: symbol,
                last_price: last_price,
                change_24h: change_24h,
                volume_24h: volume_24h,
            }
        });
    } catch (error: any) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
})

router.get("/api/get/tickers", async (req, res) => {
    //last price, 24h change %, 24h volume for all assets. last_traded_price (exists on Asset) + agg over recent fills
    try {
        const assets = await prisma.asset.findMany();

        if (!assets) {
            return res.status(404).json({ message: 'Assets not found' });
        }

        const now = new Date();
        const twenty_four_hours_ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const tickers = await Promise.all(assets.map(async (asset) => {
            const fills = await prisma.fill.findMany({
                where: {
                    symbol: asset.symbol,
                    created_at: {
                        gte: twenty_four_hours_ago
                    }
                },
                orderBy: {
                    created_at: 'asc'
                }
            });

            const last_price = Number(asset.last_traded_price);
            const volume_24h = fills.reduce((sum, f) => sum + Number(f.price) * f.quantity, 0);
            const open_price = fills.length ? Number(fills[0].price) : last_price;
            const change_24h = open_price ? ((last_price - open_price) / open_price) * 100 : 0;

            return {
                symbol: asset.symbol,
                last_price: last_price,
                change_24h: change_24h,
                volume_24h: volume_24h,
            };
        }));

        console.log({ tickers });

        res.json({ message: 'Tickers fetched successfully', tickers: tickers });
    } catch (error: any) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
})

router.get("/api/market/candles/:symbol", async (req, res) => {
    //OHLCV for TradingView, computed by bucketing fills by interval
    try {
        const symbol = req.params.symbol;
        const interval = (req.query.interval as string) || '1m';
        const limit = Number(req.query.limit) || 100;
        const from = req.query.from ? Number(req.query.from) : undefined;
        const to = req.query.to ? Number(req.query.to) : undefined;

        const interval_ms: any = {
            '1s': 1000,
            '5s': 5 * 1000,
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '10m': 10 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
        }[interval];

        if (!interval_ms) {
            return res.status(404).json({ message: 'Invalid interval' });
        }

        const to_date = to ? new Date(to) : new Date();
        const from_date = from ? new Date(from) : new Date(to_date.getTime() - limit * interval_ms);

        const fills = await prisma.fill.findMany({
            where: {
                symbol: symbol,
                created_at: {
                    gte: from_date,
                    lte: to_date
                }
            },
            orderBy: {
                created_at: 'asc'
            }
        });

        const candles_map = new Map<number, any>();

        fills.forEach((f) => {
            const time = Math.floor(new Date(f.created_at).getTime() / interval_ms) * interval_ms;
            const price = Number(f.price);
            const qty = f.quantity;

            const candle = candles_map.get(time);

            if (!candle) {
                candles_map.set(time, {
                    time: time,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: qty,
                });
            } else {
                candle.high = Math.max(candle.high, price);
                candle.low = Math.min(candle.low, price);
                candle.close = price;
                candle.volume += qty;
            }
        });

        const candles = Array.from(candles_map.values()).map((c) => ({
            ...c,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume),
        }));

        console.log({ candles });

        res.json({ message: 'Candles fetched successfully', candles });
    } catch (error: any) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
})


router.get("/api/history/balances", userAuthMiddleware, async (req, res) => {
    //deposits/withdrawals/trades/transfers, written on onramp/offramp and settlement
    try {
        const user_id = req.user;

        const balance_history = await prisma.balanceHistory.findMany({
            where: {
                user_id: user_id
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        console.log({ balance_history });

        res.json({ message: 'Balance history fetched successfully', balance_history });
    } catch (error: any) {
        console.log({ error });
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
})

export default router;