export type side = 'buy' | 'sell';
export type type = 'limit' | 'market';
export type order_status = 'filled' | 'partially_filled' | 'cancelled';

export interface Balance {
    available: number;
    locked: number;
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
export const BALANCES = new Map<string, Record<string, Balance>>();

export const ASSETS: Asset[] = [];

