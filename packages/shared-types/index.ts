import { Prisma, prisma } from "database";
export type side = 'buy' | 'sell';
export type type = 'limit' | 'market';
export type order_status = 'filled' | 'partially_filled' | 'cancelled';

export interface Balance {
    available: number;
    locked: number;
    asset_id: string,
    user_id: string
}

export interface OpenOrder {
    type: type;
    side: side;
    quantity: number;
    price: number;
    symbol: string;
    user_id: string;
    order_id: string;
    request_id: string;
    created_at: number;
}

export interface Fill {
    type: type;
    quantity: number;
    filled_quantity: number;
    price: number;
    symbol: string;
    buy_user_id: string,
    sell_user_Id: string,

    buy_order_id: string;
    sell_order_id: string;
    fill_id: string;
    created_at: number;
    order_type: string
}

export interface Order {
    type: type;
    side: side;
    quantity: number;
    price: number;
    symbol: string;
    user_id: string;
    order_id: string;
    request_id: string;
    fills: Fill[];
    created_at: number;
}


export interface Orderbook {
    bids: Map<string, OpenOrder>;
    asks: Map<string, OpenOrder>;
}

export interface Asset {
    asset_id: string;
    name: string;
    symbol: string;
}

export const ORDERBOOK = new Map<string, Orderbook>();
export const ORDERS = new Map<string, Order>();

export const FILLS: Fill[] = [];
//export const BALANCES = new Map<string, Record<string, Balance>>();
export const BALANCES: Balance[] = [];

export const ASSETS: Asset[] = [];


export const priceToBigInt18 = (number: string) => {

    const [whole, float] = number.split(".");

    console.log({ whole, float });

    const padded = float?.padEnd(18, '0').slice(0, 18);

    console.log({ padded });

    if (!whole || !float) {
        return BigInt(0)
    }

    let wh_p = whole + padded;

    console.log({ wh_p });

    return BigInt(Number(whole) + Number(padded))
}

export const scaledDecimal = (value: number, decimal: number) => {
    const base = new Prisma.Decimal(value.toString());
    const factor = new Prisma.Decimal(10).pow(decimal);

    const result = base.mul(factor);

    return result.toDecimalPlaces(0);
}

export const readableDecimal = (decimalVal: Prisma.Decimal, decimal: number) => {

    const factor = new Prisma.Decimal(10).pow(decimal);
    const result = decimalVal.div(factor)

    return result.toFixed(decimal);
}


