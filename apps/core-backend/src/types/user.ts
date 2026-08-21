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

export enum MarketType { Spot = "SPot", Perp = "Perp" }

export const Market = z.object({
    name: z.string().min(3).max(20),
    symbol: z.string().min(3).max(10),
    type: z.nativeEnum(MarketType),
    base_asset_symbol: z.string().min(3).max(20),
    quote_asset_symbol: z.string().min(3).max(20)
})

enum Type { "Limit", "Market" }
enum Side { "buy", "sell" }

export const Order = z.object({
    type: Type,
    side: Side,
    quantity: z.number().min(1),
    price: z.number().min(1),
    asset: z.string().min(3).max(10)
})