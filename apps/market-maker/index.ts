import { WebSocket } from 'ws';

type SymbolConfig = {
    symbol: string;
    binance: string;
    base: string;
    quote: string;
};

type OrderRef = { order_id: number; side: 'buy' | 'sell' };
type DepthResponse = {
    data?: {
        bids?: [number, number][];
        asks?: [number, number][];
    };
    bids?: [number, number][];
    asks?: [number, number][];
};

const API_BASE = process.env.MM_API_BASE;
const USERNAME = process.env.MM_USERNAME;
const PASSWORD = process.env.MM_PASSWORD;
const API_WAIT_MS = Number(process.env.MM_API_WAIT_MS || 60_000);
const SHOULD_FUND = (process.env.MM_FUND || 'false').toLowerCase() === 'true';
const FUND_BASE = Number(process.env.MM_FUND_BASE || 1000);
const FUND_QUOTE = Number(process.env.MM_FUND_QUOTE || 10000000);
const LEVELS = Number(process.env.MM_LEVELS || 24);
const MIN_SPREAD_BPS = Number(process.env.MM_MIN_SPREAD_BPS || 8); // 8 bps => 0.08%
const STEP = process.env.MM_STEP ? Number(process.env.MM_STEP) : undefined; // absolute price step per level
const STEP_BPS = Number(process.env.MM_STEP_BPS || 4);
const QTY = Number(process.env.MM_QTY || 0.002);
const UPDATE_MS = Number(process.env.MM_UPDATE_MS || 1_000);
const ORDER_GAP_MS = Number(process.env.MM_ORDER_GAP_MS || 25);
const PRICE_DECIMALS = Number(process.env.MM_PRICE_DECIMALS || 2);
const REFRESH_PRICE_MOVE_BPS = Number(process.env.MM_REFRESH_PRICE_MOVE_BPS || 12);
const FORCE_REFRESH_MS = Number(process.env.MM_FORCE_REFRESH_MS || 20_000);
const TAKER_ENABLED = (process.env.MM_TAKER_ENABLED || 'true').toLowerCase() !== 'false';
const TAKER_USERNAME = process.env.MM_TAKER_USERNAME || 'mm_taker';
const TAKER_PASSWORD = process.env.MM_TAKER_PASSWORD || 'marketmaker';
const TAKER_QTY = Number(process.env.MM_TAKER_QTY || QTY * 0.55);
const TAKER_INTERVAL_MS = Number(process.env.MM_TAKER_INTERVAL_MS || 2_500);

if (!API_BASE || !USERNAME || !PASSWORD) {
    throw new Error(
        'MM_API_BASE, MM_USERNAME and MM_PASSWORD must be set in .env',
    );
}
if (LEVELS <= 0) throw new Error('MM_LEVELS must be > 0');
if (QTY <= 0) throw new Error('MM_QTY must be > 0');
if (TAKER_QTY <= 0) throw new Error('MM_TAKER_QTY must be > 0');

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

function randomBetween(min: number, max: number) {
    return min + Math.random() * (max - min);
}

function roundPrice(price: number) {
    return Number(Math.max(price, 10 ** -PRICE_DECIMALS).toFixed(PRICE_DECIMALS));
}

function roundQuantity(quantity: number) {
    return Number(Math.max(quantity, 0.0000001).toFixed(8));
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

async function signInOrUp(username: string, password: string): Promise<string> {
    try {
        const login = await http<{ authToken: string }>(`/api/auth/signin`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        return login.authToken;
    } catch {
        const signup = await http<{ authToken: string }>(`/api/auth/signup`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username, password }),
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
        console.log("place order");

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

async function getDepth(token: string, symbol: string) {
    const headers = { authorization: `Bearer ${token}` };
    try {
        const res = await http<DepthResponse>(`/api/exchange/depth/${symbol}`, { headers });
        return {
            bids: res.data?.bids ?? res.bids ?? [],
            asks: res.data?.asks ?? res.asks ?? [],
        };
    } catch (e) {
        console.error('getDepth error', { symbol, e });
        return { bids: [], asks: [] };
    }
}

async function placeMarketOrder(
    token: string,
    symbol: string,
    side: 'buy' | 'sell',
    quantity: number,
): Promise<number | null> {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    try {
        const res = await http<EngineOrderResponse>(`/api/exchange/spot/order`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'market', side, quantity, symbol }),
        });
        const orderId = res?.data?.order_id ?? res?.order_id ?? null;
        const status = res?.data?.status ?? res?.status ?? '';
        console.log(`taker market ${side} ${quantity} ${symbol} ->`, { orderId, status, message: res?.message });
        return orderId;
    } catch (e) {
        console.error('placeMarketOrder error', { symbol, side, quantity, e });
        return null;
    }
}

class MarketState {
    readonly cfg: SymbolConfig;
    price: number | null = null; // last global price
    grid: OrderRef[] = []; // currently live order ids
    placing = false;
    ready = false;
    lastAnchor: number | null = null;
    lastRefreshAt = 0;
    constructor(cfg: SymbolConfig) { this.cfg = cfg; }
}

async function run() {
    const symbols = parseSymbols();

    await waitForApi();
    const token = await signInOrUp(USERNAME, PASSWORD);

    if (SHOULD_FUND) {
        await fundBalances(token, symbols);
    }
    const takerToken = TAKER_ENABLED && TAKER_USERNAME && TAKER_PASSWORD
        ? await signInOrUp(TAKER_USERNAME, TAKER_PASSWORD)
        : undefined;
    if (takerToken) {
        console.log(`MarketMaker taker signed in as ${TAKER_USERNAME}`);
        if (SHOULD_FUND) {
            await fundBalances(takerToken, symbols);
        }
    } else {
        console.log(
            'MarketMaker running without a taker account (set MM_TAKER_ENABLED=true and MM_TAKER_USERNAME/MM_TAKER_PASSWORD) — ' +
            'quotes will rest on the book but no trades will execute.',
        );
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
    const levelStep = (p: number) => STEP ?? Math.max((p * STEP_BPS) / 10000, 10 ** -PRICE_DECIMALS);
    const movedEnough = (anchor: number | null, price: number) => {
        if (!anchor) return true;
        return Math.abs(price - anchor) / anchor * 10_000 >= REFRESH_PRICE_MOVE_BPS;
    };

    const isTwoSided = (orders: OrderRef[]) => {
        return orders.some((o) => o.side === 'buy') && orders.some((o) => o.side === 'sell');
    };

    async function refreshSymbol(st: MarketState) {
        if (st.placing) return;
        const p = st.price;
        if (!p || !Number.isFinite(p) || p <= 0) return;
        if (
            st.grid.length &&
            !movedEnough(st.lastAnchor, p) &&
            Date.now() - st.lastRefreshAt < FORCE_REFRESH_MS
        ) {
            return;
        }

        st.placing = true;
        try {
            st.ready = false;
            const previousGrid = st.grid;
            const nextGrid: OrderRef[] = [];

            const base = p;
            const minHalf = halfSpread(base);
            const step = levelStep(base);
            const startBid = base - Math.max(minHalf, step);
            const startAsk = base + Math.max(minHalf, step);

            const ladder: Array<{ side: 'buy' | 'sell'; price: number; quantity: number }> = [];
            for (let i = 0; i < LEVELS; i++) {
                const bidLevelSize = QTY * randomBetween(0.8, 1.25) * (1 + i * 0.035);
                const askLevelSize = QTY * randomBetween(0.8, 1.25) * (1 + i * 0.035);
                ladder.push({
                    side: 'buy',
                    price: roundPrice(startBid - i * step),
                    quantity: roundQuantity(bidLevelSize),
                });
                ladder.push({
                    side: 'sell',
                    price: roundPrice(startAsk + i * step),
                    quantity: roundQuantity(askLevelSize),
                });
            }

            for (let j = 0; j < ladder.length; j++) {
                const { side, price, quantity } = ladder[j];
                const id = await placeOrder(token, st.cfg.symbol, side, price, quantity);
                if (id) {
                    nextGrid.push({ order_id: id, side });
                }
                if (j < ladder.length - 1) await sleep(ORDER_GAP_MS);
            }
            if (isTwoSided(nextGrid)) {
                st.grid = nextGrid;
                st.ready = true;
                if (previousGrid.length) {
                    await Promise.all(previousGrid.map((o) => cancelOrder(token, o.order_id)));
                }
            } else {
                await Promise.all(nextGrid.map((o) => cancelOrder(token, o.order_id)));
                st.grid = previousGrid;
                st.ready = isTwoSided(previousGrid);
            }
            st.lastAnchor = base;
            st.lastRefreshAt = Date.now();
            console.log(
                `MarketMaker refreshed ${st.cfg.symbol}: ${st.grid.length} live orders around ${roundPrice(base)}`,
            );
        } catch (e) {
            console.error('refreshSymbol error', { symbol: st.cfg.symbol, e });
        } finally {
            st.placing = false;
        }
    }

    if (takerToken) {
        let taking = false;
        setInterval(() => {
            if (taking) return;
            void (async () => {
                taking = true;
                try {
                    for (const st of states.values()) {
                        if (!st.ready || st.placing) continue;
                        const depth = await getDepth(takerToken, st.cfg.symbol);
                        if (!depth.bids.length || !depth.asks.length) continue;
                        const buyQty = roundQuantity(TAKER_QTY * randomBetween(0.55, 1.25));
                        const sellQty = roundQuantity(TAKER_QTY * randomBetween(0.55, 1.25));
                        await placeMarketOrder(takerToken, st.cfg.symbol, 'buy', buyQty);
                        await sleep(150);
                        await placeMarketOrder(takerToken, st.cfg.symbol, 'sell', sellQty);
                    }
                } finally {
                    taking = false;
                }
            })();
        }, TAKER_INTERVAL_MS);
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
