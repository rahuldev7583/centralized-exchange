import { WebSocket } from 'ws';

type SymbolConfig = {
    symbol: string;
    binance: string;
    base: string;
    quote: string;
};

type OrderRef = { order_id: number; side: 'buy' | 'sell' };

const API_BASE = process.env.MM_API_BASE;
const USERNAME = process.env.MM_USERNAME;
const PASSWORD = process.env.MM_PASSWORD;
const API_WAIT_MS = Number(process.env.MM_API_WAIT_MS || 60_000);
const SHOULD_FUND = (process.env.MM_FUND || 'false').toLowerCase() === 'true';
const FUND_BASE = Number(process.env.MM_FUND_BASE || 1000);
const FUND_QUOTE = Number(process.env.MM_FUND_QUOTE || 10000000);
const LEVELS = Number(process.env.MM_LEVELS || 50);
const MIN_SPREAD_BPS = Number(process.env.MM_MIN_SPREAD_BPS || 20); // 20 bps => 0.2%
const STEP = Number(process.env.MM_STEP || 10); // absolute price step per level
const QTY = Number(process.env.MM_QTY || 0.002);
const UPDATE_MS = Number(process.env.MM_UPDATE_MS || 300); // 200-500ms

if (!API_BASE || !USERNAME || !PASSWORD) {
    throw new Error(
        'MM_API_BASE, MM_USERNAME and MM_PASSWORD must be set in .env',
    );
}
if (LEVELS <= 0) throw new Error('MM_LEVELS must be > 0');

function parseSymbols(): SymbolConfig[] {
    const raw = process.env.MM_SYMBOLS;
    if (!raw) {
        throw new Error(
            'MM_SYMBOLS is not set. Add it to .env',
        );
    }
    return raw.split(',').map((pair) => {
        const [local, binance] = pair.split(':');
        const [base, quote] = local.split('_');
        if (!local || !binance || !base || !quote) {
            throw new Error(`Invalid MM_SYMBOLS entry: ${pair}`);
        }
        return { symbol: local, binance, base, quote };
    });
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForApi() {
    const deadline = Date.now() + API_WAIT_MS;
    let logged = false;

    while (true) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);

        try {
            const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
            if (res.ok) return;
        } catch {

        } finally {
            clearTimeout(timeout);
        }

        if (!logged) {
            logged = true;
            console.log(`MarketMaker waiting for core-backend at ${API_BASE} ...`);
        }
        if (Date.now() > deadline) {
            throw new Error(
                `core-backend not reachable at ${API_BASE} after ${API_WAIT_MS}ms. ` +
                `Start it (e.g. \`bun run dev --filter=core-backend\`) or set MM_API_BASE.`,
            );
        }
        await sleep(500);
    }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, init);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} ${path}: ${text}`);
    }
    return res.json() as Promise<T>;
}

async function signInOrUp(): Promise<string> {
    try {
        const login = await http<{ authToken: string }>(`/api/auth/signin`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
        });
        return login.authToken;
    } catch {
        const signup = await http<{ authToken: string }>(`/api/auth/signup`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
        });
        return signup.authToken;
    }
}

async function fundBalances(token: string, symbols: SymbolConfig[]) {
    // Fund both base and quote for each configured market
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    const uniqueAssets = new Set<string>();
    for (const s of symbols) {
        uniqueAssets.add(s.base);
        uniqueAssets.add(s.quote);
    }
    for (const asset of uniqueAssets) {
        const amt = asset === 'USDC' || asset === 'USD' || asset === 'USDC' ? FUND_QUOTE : FUND_BASE;
        try {
            await http(`/api/wallet/onramp`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ currency: asset, amount: amt }),
            });
        } catch (e) {
            console.error(`Onramp failed for ${asset}:`, e);
        }
    }
}

type EngineOrderResponse = {
    message: string;
    data?: {
        request_id: string;
        order_id: number;
        status: string;
    };
    // some routes return parsed engine response directly; we handle both styles
    status?: string;
    order_id?: number;
};

async function placeOrder(
    token: string,
    symbol: string,
    side: 'buy' | 'sell',
    price: number,
    quantity: number,
): Promise<number | null> {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    try {
        const res = await http<EngineOrderResponse>(`/api/exchange/spot/order`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'limit', side, quantity, price, symbol }),
        });
        const orderId = res?.data?.order_id ?? res?.order_id ?? null;
        return orderId;
    } catch (e) {
        console.error('placeOrder error', { symbol, side, price, quantity, e });
        return null;
    }
}

async function cancelOrder(token: string, orderId: number) {
    const headers = { authorization: `Bearer ${token}` };
    try {
        await http(`/api/exchange/spot/order/${orderId}`, { method: 'DELETE', headers });
    } catch (e) {
        console.error('cancelOrder error', { orderId, e });
    }
}

class MarketState {
    readonly cfg: SymbolConfig;
    price: number | null = null; // last global price
    grid: OrderRef[] = []; // currently live order ids
    placing = false;
    constructor(cfg: SymbolConfig) { this.cfg = cfg; }
}

async function run() {
    const symbols = parseSymbols();

    await waitForApi();
    const token = await signInOrUp();

    if (SHOULD_FUND) {
        await fundBalances(token, symbols);
    }

    const states = new Map<string, MarketState>();
    for (const s of symbols) states.set(s.symbol, new MarketState(s));

    // Build Binance combined stream URL
    const streams = symbols.map((s) => `${s.binance}@trade`).join('/');
    const BINANCE_WS = `wss://data-stream.binance.vision/stream?streams=${streams}`;
    const ws = new WebSocket(BINANCE_WS);

    ws.on('open', () => {
        console.log('MarketMaker connected to Binance WS');
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            // { stream: 'btcusdc@trade', data: { p: '60000.00', T: 1690000000000, ... }}
            const stream: string = msg.stream;
            const priceStr: string | undefined = msg?.data?.p;
            if (!priceStr) return;
            const price = Number(priceStr);
            const match = Array.from(states.values()).find((st) => `${st.cfg.binance}@trade` === stream);
            if (match) {
                match.price = price;
            }
        } catch (e) {
            console.error('WS parse error', e);
        }
    });

    ws.on('error', (e) => console.error('WS error', e));
    ws.on('close', () => console.error('WS closed'));

    const halfSpread = (p: number) => (p * MIN_SPREAD_BPS) / 10000; // bps to fraction

    async function refreshSymbol(st: MarketState) {
        if (st.placing) return;
        const p = st.price;
        if (!p || !Number.isFinite(p) || p <= 0) return;

        st.placing = true;
        try {
            // Cancel existing grid first
            if (st.grid.length) {
                await Promise.all(st.grid.map((o) => cancelOrder(token, o.order_id)));
                st.grid = [];
            }

            const base = p;
            const minHalf = halfSpread(base);
            const startBid = base - Math.max(minHalf, STEP);
            const startAsk = base + Math.max(minHalf, STEP);

            const tasks: Promise<void>[] = [];
            // Bids ladder
            for (let i = 0; i < LEVELS; i++) {
                const price = Math.max(0.0001, startBid - i * STEP);
                tasks.push(
                    (async () => {
                        const id = await placeOrder(token, st.cfg.symbol, 'buy', Number(price.toFixed(2)), QTY);
                        if (id) st.grid.push({ order_id: id, side: 'buy' });
                    })(),
                );
            }
            // Asks ladder
            for (let i = 0; i < LEVELS; i++) {
                const price = startAsk + i * STEP;
                tasks.push(
                    (async () => {
                        const id = await placeOrder(token, st.cfg.symbol, 'sell', Number(price.toFixed(2)), QTY);
                        if (id) st.grid.push({ order_id: id, side: 'sell' });
                    })(),
                );
            }

            await Promise.all(tasks);
        } catch (e) {
            console.error('refreshSymbol error', { symbol: st.cfg.symbol, e });
        } finally {
            st.placing = false;
        }
    }

    // Main update loop
    setInterval(() => {
        for (const st of states.values()) {
            // fire-and-forget; internal placing flag prevents overlap
            void refreshSymbol(st);
        }
    }, UPDATE_MS);
}

run().catch((e) => {
    console.error('MarketMaker fatal error', e);
    process.exit(1);
});
