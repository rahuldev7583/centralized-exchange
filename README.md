# Centralized Exchange

A Bun/Turborepo monorepo for a centralized crypto exchange simulation. The project includes a Next.js trading UI, an Express API, an in-memory matching engine, risk and liquidation services, an oracle price ingester, and a Prisma/PostgreSQL persistence layer coordinated through Redis queues and streams.

The application supports user/admin authentication, asset and market management, wallet funding/withdrawal flows, spot orders, perpetual futures orders, leverage settings, fills, order history, positions, funding history, liquidation history, market depth, tickers, and OHLCV candles.

## Contents

- [Architecture](#architecture)
- [Applications](#applications)
- [Packages](#packages)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Database](#database)
- [Docker](#docker)
- [API Reference](#api-reference)
- [Redis Queues and Streams](#redis-queues-and-streams)
- [Common Commands](#common-commands)
- [Troubleshooting](#troubleshooting)

## Architecture

```text
apps/web
  |
  | HTTP
  v
apps/core-backend  <-------------------------------+
  |                                                |
  | Redis list requests                            | Redis list responses
  v                                                |
apps/matching-engine ---- settlement-queue ----> apps/db-worker
  |                         ^                     |
  | matching-to-risk        | funding-to-db       |
  v                         |                     v
apps/risk-engine -----------+---------------> PostgreSQL
  ^
  | Redis stream: index-prices:events
  |
apps/oracle-service <---- Binance websocket
```

Core responsibilities:

- `web` renders the trading, portfolio, history, onramp, offramp, login, and signup pages.
- `core-backend` exposes the HTTP API, validates/authenticates requests, locks balances, and forwards order commands through Redis.
- `matching-engine` keeps the active order book in memory, matches spot/perp orders, emits fills, and responds to API requests.
- `risk-engine` handles leverage, perp order risk checks, shared mark/index price state, liquidation checks, and funding fee jobs.
- `db-worker` persists fills, settlements, leverage updates, funding fees, and index/mark prices.
- `oracle-service` consumes Binance trade streams and writes index price events into Redis.
- `database` owns the Prisma schema, migrations, generated client, and shared Prisma export.

## Applications

| Path                   | Purpose                                                         | Main command                             |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `apps/web`             | Next.js user interface on port `3000`.                          | `bun --filter web dev`                   |
| `apps/docs`            | Next.js docs app on port `3001`.                                | `bun --filter docs dev`                  |
| `apps/core-backend`    | Express API on port `5000`.                                     | `bun --filter core-backend dev`          |
| `apps/matching-engine` | In-memory order book and matcher.                               | `bun --filter matching-engine dev`       |
| `apps/risk-engine`     | Risk checks, liquidation, funding, shared price state.          | `cd apps/risk-engine && bun run main.ts` |
| `apps/db-worker`       | Redis worker that writes exchange events to Postgres.           | `bun --filter db-worker dev`             |
| `apps/oracle-service`  | Binance websocket price ingester.                               | `bun --filter oracle-service dev`        |
| `apps/ws-server`       | Minimal websocket server on port `8080`.                        | `bun --filter ws-server dev`             |
| `apps/market-maker`    | Market making bot driven by configured symbols and credentials. | `bun --filter market-maker dev`          |

## Packages

| Path                         | Purpose                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `packages/database`          | Prisma schema, migrations, generated client, and Prisma exports.                 |
| `packages/shared-types`      | Shared exchange types, in-memory maps, decimal helpers, and scheduler utilities. |
| `packages/ui`                | Shared React UI components.                                                      |
| `packages/eslint-config`     | Shared ESLint configurations.                                                    |
| `packages/typescript-config` | Shared TypeScript configurations.                                                |

## Prerequisites

- Bun `1.3.13`
- Node.js `>=18`
- PostgreSQL
- Redis
- Docker and Docker Compose, if running containerized services

This repository does not define local PostgreSQL or Redis services in `docker-compose.yml`; both must be reachable through `DATABASE_URL` and `REDIS_URL`.

## Environment Variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Important variables:

| Variable                  | Required by                   | Description                                                     |
| ------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `REDIS_URL`               | API, engines, workers, oracle | Redis connection string.                                        |
| `DATABASE_URL`            | API, workers, engines, Prisma | PostgreSQL connection string.                                   |
| `SECRET_KEY`              | `core-backend`                | JWT signing secret for users/admins.                            |
| `ADMIN_SECRET_KEY`        | `core-backend`                | Header secret required for admin signup.                        |
| `CORS_ORIGINS`            | `core-backend`                | Comma-separated allowed browser origins.                        |
| `BINANCE_WS_STREAM_URL`   | `oracle-service`              | Binance combined stream URL.                                    |
| `NEXT_PUBLIC_API_URL`     | `web`                         | Browser-visible API base URL.                                   |
| `NEXT_PUBLIC_WS_URL`      | `web`                         | Browser-visible websocket URL.                                  |
| `LIQUIDATION_USER_ID`     | `risk-engine`                 | User ID used by liquidation workflows.                          |
| `MM_*`                    | `market-maker`                | Market maker credentials, symbols, sizing, spreads, and timing. |
| `ECR_REGISTRY`, `VERSION` | Production compose            | Image registry and tag for `docker-compose.prod.yml`.           |

Use strong secrets outside development. Do not commit real `.env` values.

## Local Development

Install dependencies from the repository root:

```bash
bun install
```

Generate the Prisma client:

```bash
bun --filter database db:generate
```

Apply migrations:

```bash
bun --filter database db:migrate
```

Start all Turborepo `dev` tasks:

```bash
bun run dev
```

For day-to-day exchange development, it is often easier to run the core services in separate terminals:

```bash
bun --filter core-backend dev
bun --filter matching-engine dev
bun --filter db-worker dev
cd apps/risk-engine && bun run main.ts
bun --filter oracle-service dev
bun --filter web dev
```

Open:

- Web app: `http://localhost:3000`
- Docs app: `http://localhost:3001`
- API health check: `http://localhost:5000/api/health`

## Database

The Prisma schema lives at `packages/database/prisma/schema.prisma`.

Main models:

- `User` and `Admin`
- `Asset` and `Market`
- `Asset_balance`
- `Order` and `Fill`
- `Position`
- `leverage`
- `AssetPrice`
- `FundingFee`
- `Liquidation`
- `BalanceHistory`

Database commands:

```bash
bun --filter database db:generate
bun --filter database db:migrate
bun --filter database db:deploy
bun --filter database db:seed
bun --filter database db:studio
```

The current seed script only verifies connectivity and prints `Seed complete.`

## Docker

Build and run local images:

```bash
docker compose up --build
```

The local compose file starts:

- `web` on `3000`
- `core-backend` on `5000`
- `matching-engine`
- `risk-engine`
- `db-worker`
- `oracle-service`

The production compose file expects prebuilt images:

```bash
ECR_REGISTRY=<registry> VERSION=<tag> docker compose -f docker-compose.prod.yml up
```

The image entrypoint uses the `APP` environment variable to start the correct service. For `core-backend`, migrations run on startup by default when `MIGRATE_ON_START=true`.

## API Reference

Base URL in development:

```text
http://localhost:5000
```

Authenticated user routes expect:

```text
Authorization: Bearer <token>
```

Admin creation expects:

```text
x_secret_key: <ADMIN_SECRET_KEY>
```

### Health

| Method | Route         | Description       |
| ------ | ------------- | ----------------- |
| `GET`  | `/api/health` | API health check. |

### Authentication

| Method | Route                    | Description                                    |
| ------ | ------------------------ | ---------------------------------------------- |
| `POST` | `/api/auth/signup`       | Create a user and return a JWT.                |
| `POST` | `/api/auth/signin`       | Sign in a user and return a JWT.               |
| `POST` | `/api/auth/admin/signup` | Create an admin with `x_secret_key`.           |
| `POST` | `/api/auth/admin/signin` | Sign in an admin and return a JWT.             |
| `GET`  | `/api/me`                | Return the authenticated user ID and leverage. |

Example user signup:

```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'
```

### Assets and Markets

| Method | Route                          | Description                 |
| ------ | ------------------------------ | --------------------------- |
| `POST` | `/api/exchange/asset/add`      | Admin-only asset creation.  |
| `PUT`  | `/api/exchange/asset/edit/:id` | Admin-only asset update.    |
| `POST` | `/api/exchange/market/add`     | Admin-only market creation. |
| `GET`  | `/api/exchange/assets`         | List assets.                |
| `GET`  | `/api/exchange/markets`        | List markets.               |
| `GET`  | `/api/tickers/:symbol`         | Ticker for one symbol.      |
| `GET`  | `/api/get/tickers`             | Tickers for all assets.     |
| `GET`  | `/api/market/candles/:symbol`  | OHLCV candles from fills.   |

Market candle query parameters:

- `interval`: `1s`, `5s`, `1m`, `5m`, `10m`, `30m`, `1h`, or `1d`
- `limit`: number of buckets, default `100`
- `from`: timestamp in milliseconds
- `to`: timestamp in milliseconds

### Wallet

| Method | Route                   | Description                                                       |
| ------ | ----------------------- | ----------------------------------------------------------------- |
| `POST` | `/api/wallet/onramp`    | Deposit a supported currency into the authenticated user wallet.  |
| `POST` | `/api/wallet/offramp`   | Withdraw a supported currency from the authenticated user wallet. |
| `GET`  | `/api/wallet/balance`   | List available and locked balances for all assets.                |
| `GET`  | `/api/history/balances` | Deposit, withdrawal, and balance history.                         |

Example onramp:

```bash
curl -X POST http://localhost:5000/api/wallet/onramp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"currency":"USDC","amount":10000}'
```

### Exchange

| Method   | Route                                | Description                                   |
| -------- | ------------------------------------ | --------------------------------------------- |
| `POST`   | `/api/exchange/spot/order`           | Create a spot limit or market order.          |
| `POST`   | `/api/exchange/future/order`         | Create or close a perpetual futures order.    |
| `GET`    | `/api/exchange/spot/order/:order_id` | Fetch an order from the matching engine.      |
| `DELETE` | `/api/exchange/spot/order/:order_id` | Cancel a spot order.                          |
| `GET`    | `/api/exchange/depth/:symbol`        | Fetch aggregated order book depth.            |
| `POST`   | `/api/exchange/leverage`             | Update user leverage.                         |
| `GET`    | `/api/exchange/trades/:symbol`       | Fetch recent fills for a symbol.              |
| `GET`    | `/api/exchange/orders`               | Fetch authenticated user orders.              |
| `GET`    | `/api/exchange/orders/:status`       | Fetch orders filtered by status.              |
| `GET`    | `/api/exchange/fills`                | Fetch authenticated user fills.               |
| `GET`    | `/api/exchange/positions`            | Fetch authenticated user perp positions.      |
| `GET`    | `/api/history/funding`               | Fetch authenticated user funding fee history. |
| `GET`    | `/api/history/liquidation`           | Fetch authenticated user liquidation history. |

Example spot limit order:

```bash
curl -X POST http://localhost:5000/api/exchange/spot/order \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"limit","side":"buy","quantity":0.01,"price":65000,"symbol":"BTC_USDC"}'
```

Example market order:

```bash
curl -X POST http://localhost:5000/api/exchange/spot/order \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"market","side":"sell","quantity":0.01,"symbol":"BTC_USDC"}'
```

## Redis Queues and Streams

Redis is the message bus between API, matching, risk, oracle, and persistence services.

| Name                               | Type   | Producer          | Consumer                   | Purpose                                            |
| ---------------------------------- | ------ | ----------------- | -------------------------- | -------------------------------------------------- |
| `incoming-request`                 | List   | `core-backend`    | `matching-engine`          | Spot order, cancel, get-order, and depth commands. |
| `response-queue-<backend_id>`      | List   | `matching-engine` | `core-backend`             | Correlated matching responses.                     |
| `risk-engine-req-queue`            | List   | `core-backend`    | `risk-engine`              | Perp order and close-position requests.            |
| `response-queue-perp-<backend_id>` | List   | `risk-engine`     | `core-backend`             | Risk/perp responses.                               |
| `risk-to-matching-eng`             | List   | `risk-engine`     | `matching-engine`          | Risk-approved perp orders.                         |
| `matching-to-risk-pub-queue`       | List   | `matching-engine` | `risk-engine`              | Matched fill events for risk state.                |
| `settlement-queue`                 | List   | `matching-engine` | `db-worker`                | Fill and settlement persistence.                   |
| `leverage-req-queue`               | List   | `core-backend`    | `risk-engine`              | Leverage update requests.                          |
| `leverage-db-queue`                | List   | `risk-engine`     | `db-worker`                | Persist leverage updates.                          |
| `leverage-res-queue`               | List   | `db-worker`       | `core-backend`             | Leverage update confirmations.                     |
| `funding-to-db-queue`              | List   | `risk-engine`     | `db-worker`                | Funding fee settlement.                            |
| `liquidation-to-matching-eng`      | List   | `risk-engine`     | `matching-engine`          | Liquidation orders.                                |
| `index-prices:events`              | Stream | `oracle-service`  | `db-worker`, `risk-engine` | External index price events.                       |

## Common Commands

```bash
# Install dependencies
bun install

# Start every package/app with a dev script
bun run dev

# Build all buildable apps/packages
bun run build

# Run lint tasks
bun run lint

# Run TypeScript checks
bun run check-types

# Format TypeScript, TSX, and Markdown
bun run format
```

## Troubleshooting

- If the API throws `REDIS_URL is not set`, confirm `.env` exists and the service is started from a context that loads it.
- If Prisma commands fail, confirm `DATABASE_URL` points to a reachable PostgreSQL database and run `bun --filter database db:generate`.
- If orders time out, make sure `matching-engine` is running and can reach the same Redis instance as `core-backend`.
- If perp orders do not complete, run both `risk-engine` and `matching-engine`.
- If balances do not update after fills, run `db-worker`.
- If mark/index prices are empty, run `oracle-service` and verify `BINANCE_WS_STREAM_URL`.
- If the web app cannot call the API, verify `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS`.
