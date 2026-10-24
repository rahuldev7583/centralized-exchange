import express from 'express';

import authRouter from './routes/auth';
import exchangeRouter from './routes/exchange';
import assetRouter from "./routes/asset";
import walletRouter from "./routes/wallet"
import { createClient } from 'redis';
import { userAuthMiddleware } from './middleware/auth';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is not set');
}

const app = express();
export const BACKEND_ID = crypto.randomUUID();

const CORS_ORIGINS: string[] = (
  process.env.CORS_ORIGINS ?? "http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (CORS_ORIGINS.includes("*") || CORS_ORIGINS.includes(origin))) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      CORS_ORIGINS.includes("*") ? "*" : origin,
    );
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x_secret_key",
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

//add bcrypt, zod schema, jwt
//endpoint need for exchange and orderbook
//add redis client

//go through readme, understand flow and create diagram
//implement redis for both core and engine

//add required schema

//implement create order, get depth, get user balance, get order, cancel order



export const client = createClient({ url: process.env.REDIS_URL });

client.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

client.connect();
console.log('Connected');

export const riskEngineclient = createClient({ url: process.env.REDIS_URL });

riskEngineclient.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

riskEngineclient.connect();
console.log('riskEngineclient Connected');

export const leverageClient = createClient({ url: process.env.REDIS_URL });

leverageClient.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

leverageClient.connect();
console.log('leverage Connected');


const responseConsumer = createClient({ url: process.env.REDIS_URL });

responseConsumer.on('error', (err: any) =>
  console.log({ msg: 'Response consumer error', err }),
);

const RESPONSE_QUEUES = [
  `response-queue-${BACKEND_ID}`,
  `response-queue-perp-${BACKEND_ID}`,
  `leverage-res-queue-${BACKEND_ID}`,
];

interface PendingResponse {
  resolve: (value: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingResponses = new Map<string, PendingResponse>();

async function startResponseConsumer() {
  await responseConsumer.connect();
  console.log('Response consumer connected');
  while (true) {
    try {
      const msg = await responseConsumer.brPop(RESPONSE_QUEUES, 0);
      if (!msg) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(msg.element);
      } catch {
        continue;
      }

      const requestId = parsed?.request_id;
      if (!requestId) continue;

      const pending = pendingResponses.get(requestId);
      if (!pending) {
        // No waiter (already timed out, or never registered) — drop it.
        continue;
      }

      pendingResponses.delete(requestId);
      clearTimeout(pending.timer);
      pending.resolve(parsed);
    } catch (err) {
      console.log({ msg: 'Response consumer error, retrying', err });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}


export function waitForResponse(request_id: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingResponses.delete(request_id);
      resolve(null);
    }, timeoutMs);
    pendingResponses.set(request_id, { resolve, timer });
  });
}

startResponseConsumer();

export async function get_identifier(queue: string, backend?: boolean) {
  const res_client = createClient({ url: process.env.REDIS_URL });

  res_client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
  );

  res_client.connect();
  console.log('Connected');
  const url = !backend ? queue : `${queue}-${BACKEND_ID}`;
  const queue_res = await res_client.brPop(url, 2);

  console.log('wait for identifier');

  console.log({ queue_res });
  return queue_res;
}

app.use(express.json());

app.get('/api/health', (req, res) => {
  console.log('health endpoints');

  res.json({ message: 'Server is running' });
});

app.use(authRouter);
app.use(assetRouter);
app.use(userAuthMiddleware, walletRouter);
app.use(userAuthMiddleware, exchangeRouter);

app.listen(5000, () => {
  console.log('Server is listening on part 5000');
});
