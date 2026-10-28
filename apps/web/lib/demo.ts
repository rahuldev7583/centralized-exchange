import { useSyncExternalStore } from "react";

const KEY = "demo_trades";
const EVENT = "demo-trades:change";

export function isDemoTrades(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY) === "true";
}

export function setDemoTrades(on: boolean) {
    localStorage.setItem(KEY, String(on));
    window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
    window.addEventListener(EVENT, cb);
    return () => window.removeEventListener(EVENT, cb);
}

export function useDemoTrades(): boolean {
    return useSyncExternalStore(subscribe, isDemoTrades, () => false);
}
