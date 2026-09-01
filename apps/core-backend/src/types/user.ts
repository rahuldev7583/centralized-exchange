import * as z from 'zod';

export const User = z.object({
    username: z.string().min(3).max(20),
    password: z.string().min(3).max(20),
});

export const Asset = z.object({
    name: z.string().min(3).max(20),
    symbol: z.string().min(3).max(10),
    decimals: z.number().min(0).max(100)
})

export enum MarketType { Spot = "spot", Perp = "perp" }

export const Market = z.object({
    name: z.string().min(3).max(20),
    symbol: z.string().min(3).max(15),
    type: z.nativeEnum(MarketType),
    base_asset_symbol: z.string().min(3).max(20),
    quote_asset_symbol: z.string().min(3).max(20)
})

enum Type { Limit = "limit", Market = "market" }
enum Side { Buy = "buy", Sell = "sell" }

export const Order = z.object({
    type: z.nativeEnum(Type),
    side: z.nativeEnum(Side),
    quantity: z.number().min(1),
    price: z.number().min(1),
    symbol: z.string().min(3).max(20)
})