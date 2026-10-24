# Matching Engine Contract

This document defines the single source of truth for the matching engine
boundary. Both implementations — the TypeScript engine (`apps/matching-engine`)
and the Rust engine (`matching-engine-rust`) — MUST satisfy this contract so
that a benchmark against either stack measures the same thing and returns the
same shape.

---

## 1. Numeric representation

All prices and quantities exchanged with the engine are **non-negative
integers**, transmitted over Redis as **decimal integer strings** (never
floats, never scientific notation).

| Field      | Unit                     | Scale   | Example (wire string) | Meaning          |
| ---------- | ------------------------ | ------- | --------------------- | ---------------- |
| `price`    | whole quote units        | `10^0`  | `"65000"`             | limit price      |
| `quantity` | base units (fixed 18 dp) | `10^18` | `"18000000000000000"` | 0.018 base units |

- A human quantity `0.018` is `18 * 10^15` base units → `"18000000000000000"`.
- A human price `65000` is `65000` whole units → `"65000"`.

### Valid ranges

- `0 <= price <= 2^53 - 1` (both engines must represent it exactly; Rust uses
  `u64`, TypeScript uses `bigint`).
- `0 <= quantity <= 2^53 - 1` in base units.
- The engines perform **integer arithmetic only**. Fractional results are
  truncated toward zero (Rust `u64` division and TypeScript `bigint` division
  both truncate, so they agree).

### Market orders

A market order **omits `price`** from its payload (or sends `"0"`). The engine
treats an absent price as `0` and never uses it for matching. Limit orders
always include `price`.

---

## 2. Status vocabulary

One enum, used everywhere a status is serialized:

| Value                  | Meaning                                 |
| ---------------------- | --------------------------------------- |
| `accepted`             | Rested on the book (no immediate match) |
| `fully_filled`         | Entire quantity matched                 |
| `partially_filled`     | Some quantity matched, remainder rested |
| `cancelled`            | Order cancelled                         |
| `not_found`            | Referenced order id does not exist      |
| `rejected`             | Order could not be accepted             |
| `self_trade_prevented` | Taker would have crossed its own order  |

`filled_quantity`/`remaining_quantity` determine `fully_filled` vs
`partially_filled`: `remaining == 0 → fully_filled`, else `partially_filled`.

---

## 3. Result shape

Every engine operation returns a result with a `response` and a `fills` array:

```ts
{
  response: {
    request_id: string,
    order_id: string,
    status: OrderStatus,            // §2
    price: string,                  // integer string, whole units (§1)
    filled_quantity: string,        // integer string, base units (§1)
    remaining_quantity: string,     // integer string, base units (§1)
    message: string,                // informational; not part of equality
    data: OpenOrder | null,         // order detail for get-order
    fills: Fill[]                   // complete list of fills for this order
  },
  fills: Fill[]                     // same complete list, flat
}
```

- `remaining_quantity = quantity - filled_quantity` always.
- `fills` is a **complete array** of every individual fill produced by the
  order. Multi-fill orders (a taker crossing several resting orders) emit one
  entry per resting order. It is never a single `Option`.
- A `Fill` carries integer base-unit `quantity`/`filled_quantity`/`price` and
  both `buy_*` and `sell_*` user/order ids.

> `message` is human-facing and intentionally not part of benchmark equality.

---

## 4. Redis protocol

### Input queue

Requests arrive on the `incoming-request` list. The payload envelope is:

```json
{ "BACKEND_ID": "...", "request_id": "...", "payload": {...}, "command": "..." }
```

Commands: `create-order`, `cancel-order`, `get-order`, `get-depth`,
`get-balance`, `forced-liquidate`, `close-position`.

### Response queue

The engine publishes each response to **one shared per-backend queue**:

```
response-queue-{backend_id}
```

There is **no** per-request suffix. The backend correlates by `request_id`
inside the message. (`response-queue-{backend_id}-{request_id}` is a bug.)

### Queue priority

The engine must pop from queues in this fixed priority order (first key wins):

1. `liquidation-to-matching-eng`
2. `incoming-request`
3. `risk-to-matching-eng`

Both stacks use this order.

### Publishing behavior

Publishing to Redis is **fire-and-forget**: the matching hot path does not wait
for the write to complete and does not apply backpressure on Redis. The
TypeScript engine uses non-awaited `lPush`; the Rust engine uses a
writer-thread + channel so the matcher never blocks on Redis I/O.

### Side-effect channels

- `settlement-queue` — one message per fill/cancel for `db-worker`.
- `matching-to-risk-pub-queue` — one message per fill/cancel for `risk-engine`.

These channels are **legacy persistence side-effects and are excluded from the
engine parity contract**. They are not part of a benchmark comparison. The
TypeScript engine continues to emit human-decimal numbers on them (so the
existing `db-worker`/`risk-engine` keep working unchanged); the Rust engine
emits integer base units. Migrating `db-worker`/`risk-engine` onto the base-unit
contract is a separate follow-up.

---

## 5. Startup

Engines initialize one order book per market symbol. Three modes, in order of
precedence:

1. `MARKETS_FIXTURE` env var set → load the fixture (see below); do not touch
   PostgreSQL or HTTP.
2. Otherwise the stack's native source:
   - TypeScript: PostgreSQL via `prisma.market.findMany()`.
   - Rust: HTTP `GET BACKEND_URL`.

### Fixture format

`MARKETS_FIXTURE` is either inline JSON or a path to a JSON file:

```json
{ "markets": [{ "symbol": "BTC_USDC" }, { "symbol": "ETH_USDC" }] }
```

Both stacks parse this exact shape.

---

## 6. Logging

Per-request logging (`console.log`/`println!` on every order) is **disabled by
default** and gated behind `VERBOSE_LOGGING=true` (or `LOG_LEVEL=debug`).
Measured/benchmark runs must run with logging off.
