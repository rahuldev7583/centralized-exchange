import type { Orderbook } from "shared-types";

console.log("risk engine");

export type engineStatus = | 'pending' | 'ready' | 'down';

export const ORDERBOOK = new Map<string, Orderbook>();

let engine_status: engineStatus = 'down'

while (1) {
    //initialize perp orderbook
    //load all user asset balance and leverage
    if (engine_status == 'down') {
        engine_status = 'pending'
    }
}