const BINANCE_API = process.env.BINANCE_API_URL || 'https://data-api.binance.vision';

const toBinanceSymbol = (symbol: string) => symbol.split('_').slice(0, 2).join('').toUpperCase();

async function binanceGet(path: string, params: Record<string, string | number>) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${BINANCE_API}${path}?${qs}`);
    if (!res.ok) throw new Error(`Binance ${path} failed (${res.status})`);
    return res.json() as Promise<any>;
}

export async function binanceDepth(symbol: string) {
    const d = await binanceGet('/api/v3/depth', { symbol: toBinanceSymbol(symbol), limit: 24 });
    const map = ([price, size]: [string, string]) => ({ price: Number(price), size: Number(size) });
    return { symbol, bids: d.bids.map(map), asks: d.asks.map(map), timestamp: Date.now() };
}

export async function binanceTrades(symbol: string) {
    const list = await binanceGet('/api/v3/trades', { symbol: toBinanceSymbol(symbol), limit: 20 });
    return list
        .reverse()
        .map((t: any) => ({
            id: `binance-${t.id}`,
            type: 'limit',
            price: Number(t.price),
            quantity: Number(t.qty),
            symbol,
            status: 'filled',
            side: t.isBuyerMaker ? 'sell' : 'buy',
            created_at: new Date(t.time).toISOString(),
            updated_at: new Date(t.time).toISOString(),
        }));
}

// Binance has no 5s/10m/7d/30d-exact klines, so those are fetched from a finer
// interval and re-bucketed to the requested size.
const KLINE_SOURCE: Record<string, { source: string; sourceMs: number }> = {
    '1s': { source: '1s', sourceMs: 1000 },
    '5s': { source: '1s', sourceMs: 1000 },
    '1m': { source: '1m', sourceMs: 60_000 },
    '5m': { source: '5m', sourceMs: 300_000 },
    '10m': { source: '5m', sourceMs: 300_000 },
    '30m': { source: '30m', sourceMs: 1_800_000 },
    '1h': { source: '1h', sourceMs: 3_600_000 },
    '1d': { source: '1d', sourceMs: 86_400_000 },
    '7d': { source: '1d', sourceMs: 86_400_000 },
    '30d': { source: '1d', sourceMs: 86_400_000 },
};

export async function binanceCandles(symbol: string, interval: string, intervalMs: number, limit: number) {
    const cfg = KLINE_SOURCE[interval];
    if (!cfg) return [];
    const ratio = Math.max(1, Math.round(intervalMs / cfg.sourceMs));
    const rows: any[] = await binanceGet('/api/v3/klines', {
        symbol: toBinanceSymbol(symbol),
        interval: cfg.source,
        limit: Math.min(1000, limit * ratio),
    });

    const buckets = new Map<number, any>();
    for (const k of rows) {
        const time = Math.floor(k[0] / intervalMs) * intervalMs;
        const [open, high, low, close, volume] = [k[1], k[2], k[3], k[4], k[5]].map(Number);
        const c = buckets.get(time);
        if (!c) {
            buckets.set(time, { time, open, high, low, close, volume });
        } else {
            c.high = Math.max(c.high, high);
            c.low = Math.min(c.low, low);
            c.close = close;
            c.volume += volume;
        }
    }
    return Array.from(buckets.values());
}
