import { createClient } from 'redis';
import { existsSync, readFileSync } from 'node:fs';
import { prisma } from 'database';
import {
  MatchingEngine,
  type Asset,
  type EngineResponse,
  type EngineResult,
  type EngineStatus,
  type OrderInput,
} from './engine';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is not set');
}

export type engineStatus = EngineStatus;
export type engineResponse = EngineResponse;

export type engineCommand =
  | 'create_order'
  | 'cancel_order'
  | 'get-order'
  | 'get-balance'
  | 'get-depth'
  | 'create-asset';

export interface engineRequest {
  backend_id: string;
  request_id: string;
  payload: any;
  command: engineCommand;
}

// Request-path logging is off unless VERBOSE_LOGGING is enabled (ENGINE_CONTRACT.md §6).
const verbose = process.env.VERBOSE_LOGGING === 'true';
const log = (...args: unknown[]) => {
  if (verbose) console.log(...args);
};

// Engine results carry `bigint` (integer base units); serialize them as integer strings.
const stringify = (v: unknown): string =>
  JSON.stringify(v, (_key, val) =>
    typeof val === 'bigint' ? val.toString() : val,
  );

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', (err: any) => log({ msg: 'Redis client error', err }));

const publishclient = createClient({ url: process.env.REDIS_URL });
publishclient.on('error', (err: any) => log({ msg: 'Redis client error', err }));

const dbWorkerclient = createClient({ url: process.env.REDIS_URL });
dbWorkerclient.on('error', (err: any) => log({ msg: 'Redis client error', err }));

const riskEngclient = createClient({ url: process.env.REDIS_URL });
riskEngclient.on('error', (err: any) => log({ msg: 'Redis client error', err }));

const riskEngPubclient = createClient({ url: process.env.REDIS_URL });
riskEngPubclient.on('error', (err: any) => log({ msg: 'Redis client error', err }));

const liquidationClient = createClient({ url: process.env.REDIS_URL });
liquidationClient.on('error', (err: any) => log({ msg: 'Redis client error', err }));

//incoming-request => client => for receiving request from api to matching engine
// response-queue-${backend_id} => publishclient => for sending matching engine response back to api
// settlement-queue => dbWorkerclient => for db worker to fills and settlements
// risk-to-matching-eng => riskEngclient => to receive perp order from risk engine

const engine = new MatchingEngine();

// Fixture format (ENGINE_CONTRACT.md §5): {"markets":[{"symbol":"BTC_USDC"},...]}
// `MARKETS_FIXTURE` is either inline JSON or a path to a JSON file.
function loadFixtureSymbols(): string[] {
  const raw = process.env.MARKETS_FIXTURE;
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const path = raw.trim();
    if (!existsSync(path)) return [];
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return [];
    }
  }
  const markets = (parsed as any)?.markets;
  if (!Array.isArray(markets)) return [];
  return markets
    .map((m) => (typeof m === 'string' ? m : m?.symbol))
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}

async function loadMarketSymbols(): Promise<string[]> {
  const fixture = loadFixtureSymbols();
  if (fixture.length > 0) {
    log({ msg: 'loaded markets from MARKETS_FIXTURE', symbols: fixture });
    return fixture;
  }

  const markets = await prisma.market.findMany();
  return markets.map((m) => m.symbol).filter((s): s is string => Boolean(s));
}

const publishResult = (result: EngineResult, backend_id: string) => {
  for (const message of result.settlement) {
    dbWorkerclient.lPush('settlement-queue', stringify(message));
  }

  for (const message of result.risk) {
    riskEngPubclient.lPush('matching-to-risk-pub-queue', stringify(message));
  }

  if (result.response !== undefined && result.response !== null) {
    publishclient.lPush(`response-queue-${backend_id}`, stringify(result.response));
  }
};

const create_order = (
  payload: OrderInput,
  backend_id: string,
  request_id: string,
  request_type?: string,
  command?: string,
) => {
  publishResult(
    engine.createOrder(payload, request_id, { request_type, command }),
    backend_id,
  );
};

const cancel_order = (payload: string, backend_id: string, request_id: string) => {
  publishResult(engine.cancelOrder(payload, request_id), backend_id);
};

const get_order = (payload: string, backend_id: string, request_id: string) => {
  publishResult(engine.getOrder(payload, request_id), backend_id);
};

const get_balance = (payload: any, backend_id: string, request_id: string) => {
  publishResult(engine.getBalance(payload, request_id), backend_id);
};

const get_depth = (payload: string, backend_id: string, request_id: string) => {
  publishResult(engine.getDepth(payload, request_id), backend_id);
};

const create_asset = (payload: Asset, backend_id: string, request_id: string) => {
  publishResult(engine.createAsset(payload, request_id), backend_id);
};

let engine_status: engineStatus = 'down';

await Promise.all([
  client.connect(),
  publishclient.connect(),
  dbWorkerclient.connect(),
  riskEngclient.connect(),
  riskEngPubclient.connect(),
  liquidationClient.connect(),
]);

// Seed one order book per market symbol (fixture takes precedence over the DB).
const symbols = await loadMarketSymbols();
for (const symbol of symbols) {
  engine.orderbook.set(symbol, { asks: new Map(), bids: new Map() });
}
engine_status = 'ready';
log({ msg: 'matching engine ready', markets: symbols.length });

while (1) {
  const req = await client.brPop(
    ['liquidation-to-matching-eng', 'incoming-request', 'risk-to-matching-eng'],
    0,
  );

  let parsed_liquidation_req;
  let parsed_req;
  let parsed_risk_req;

  if (req) {
    if (req.key === 'liquidation-to-matching-eng') {
      parsed_liquidation_req = JSON.parse(req.element);
    } else if (req.key === 'incoming-request') {
      parsed_req = JSON.parse(req.element);
    } else if (req.key === 'risk-to-matching-eng') {
      parsed_risk_req = JSON.parse(req.element);
    }
  }

  if (parsed_liquidation_req) {
    if (parsed_liquidation_req.command == 'forced-liquidate') {
      create_order(
        parsed_liquidation_req.payload,
        parsed_liquidation_req.BACKEND_ID,
        parsed_liquidation_req.request_id,
      );
    }
  }

  if (parsed_req) {
    if (parsed_req.command === 'create-order') {
      create_order(
        {
          ...parsed_req.payload,
          price: BigInt(parsed_req.payload.price ?? 0),
          quantity: BigInt(parsed_req.payload.quantity),
        },
        parsed_req.BACKEND_ID,
        parsed_req.request_id,
      );
    } else if (parsed_req.command === 'cancel-order') {
      cancel_order(parsed_req.payload, parsed_req.BACKEND_ID, parsed_req.request_id);
    } else if (parsed_req.command === 'get-order') {
      get_order(parsed_req.payload, parsed_req.BACKEND_ID, parsed_req.request_id);
    } else if (parsed_req.command === 'get-balance') {
      get_balance(parsed_req.payload, parsed_req.BACKEND_ID, parsed_req.request_id);
    } else if (parsed_req.command === 'get-depth') {
      get_depth(parsed_req.payload, parsed_req.BACKEND_ID, parsed_req.request_id);
    } else if (parsed_req.command === 'create-asset') {
      create_asset(parsed_req.payload, parsed_req.BACKEND_ID, parsed_req.request_id);
    }
  }

  if (parsed_risk_req) {
    if (parsed_risk_req.command === 'create-order') {
      create_order(
        {
          ...parsed_risk_req.payload,
          price: BigInt(parsed_risk_req.payload.price ?? 0),
          quantity: BigInt(parsed_risk_req.payload.quantity),
        },
        parsed_risk_req.BACKEND_ID,
        parsed_risk_req.request_id,
        'perp',
      );
    } else if (parsed_risk_req.command === 'close-position') {
      create_order(
        {
          ...parsed_risk_req.payload,
          price: BigInt(parsed_risk_req.payload.price ?? 0),
          quantity: BigInt(parsed_risk_req.payload.quantity),
        },
        parsed_risk_req.BACKEND_ID,
        parsed_risk_req.request_id,
        'perp',
        'close-position',
      );
    }
  }
}
