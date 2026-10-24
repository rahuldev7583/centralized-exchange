export type Side = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
export type OrderStatus =
  | 'accepted'
  | 'fully_filled'
  | 'partially_filled'
  | 'cancelled'
  | 'not_found'
  | 'rejected'
  | 'self_trade_prevented';
export type EngineStatus = 'pending' | 'ready' | 'down';

// Matching-engine contract (ENGINE_CONTRACT.md §1):
//   price    -> whole quote units (10^0)
//   quantity -> fixed 18-decimal base units (10^18)
// Both are non-negative integers carried as `bigint` in-process and as integer
// strings on the wire.
const QUANTITY_SCALE = 10n ** 18n;

// Legacy downstream channels (settlement/risk) still expect human-decimal
// numbers; these helpers convert integer base units back for those messages
// only. The engine's own result stays in integer base units.
const qtyToHuman = (base: bigint): number => Number(base) / Number(QUANTITY_SCALE);
const priceToHuman = (price: bigint): number => Number(price);

export interface OpenOrder {
  order_id: string;
  side: Side;
  price: bigint;
  quantity: bigint;
  user_id: string;
  request_id: string;
  type: OrderType;
  symbol: string;
  created_at: number;
}

export interface Fill {
  type: OrderType;
  quantity: bigint;
  filled_quantity: bigint;
  price: bigint;
  symbol: string;
  buy_user_id: string;
  sell_user_id: string;
  buy_order_id: string;
  sell_order_id: string;
  fill_id: string;
  created_at: number;
  order_type: string;
}

export interface Order {
  order_id: string;
  side: Side;
  price: bigint;
  quantity: bigint;
  user_id: string;
  request_id: string;
  type: OrderType;
  symbol: string;
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

export interface Balance {
  available: number;
  locked: number;
}

export interface OrderInput {
  symbol: string;
  type: OrderType;
  side: Side;
  price: bigint;
  quantity: bigint;
  user_id: string;
}

export interface EngineResponse {
  request_id: string;
  order_id: string;
  status: OrderStatus;
  message: string;
  price: bigint;
  filled_quantity: bigint;
  remaining_quantity: bigint;
  data?: unknown;
  fills: Fill[];
}

export interface EngineResult {
  response: unknown;
  fills: Fill[];
  settlement: unknown[];
  risk: unknown[];
}

export interface CreateOrderOptions {
  request_type?: string;
  command?: string;
}

export type IdGenerator = () => string;

const defaultId: IdGenerator = () => crypto.randomUUID();

export class MatchingEngine {
  readonly orderbook = new Map<string, Orderbook>();
  readonly orders = new Map<string, Order>();
  readonly fills: Fill[] = [];
  readonly balances = new Map<string, Record<string, Balance>>();
  readonly assets: Asset[] = [];

  constructor(private readonly generateId: IdGenerator = defaultId) { }

  // Resting orders on the counterparty side, best price first, FIFO within a
  // price level. For a buy taker we sweep asks (lowest first); for a sell
  // taker we sweep bids (highest first).
  private restingOrders(book: Orderbook, side: Side): OpenOrder[] {
    const map = side === 'buy' ? book.asks : book.bids;
    const list = [...map.values()];
    list.sort((a, b) => {
      const pc =
        side === 'buy'
          ? a.price < b.price
            ? -1
            : a.price > b.price
              ? 1
              : 0
          : a.price < b.price
            ? 1
            : a.price > b.price
              ? -1
              : 0;
      if (pc !== 0) return pc;
      return a.created_at - b.created_at;
    });
    return list;
  }

  private consume(book: Orderbook, side: Side, order: OpenOrder, take: bigint) {
    const map = side === 'buy' ? book.asks : book.bids;
    if (take >= order.quantity) {
      map.delete(order.order_id);
    } else {
      map.set(order.order_id, { ...order, quantity: order.quantity - take });
    }
  }

  createOrder(
    payload: OrderInput,
    request_id: string,
    options: CreateOrderOptions = {},
  ): EngineResult {
    const { request_type, command } = options;
    const order_id = this.generateId();
    const quantity = payload.quantity;
    const price = payload.type === 'market' ? 0n : payload.price;
    const market = this.orderbook.get(payload.symbol);

    const fills: Fill[] = [];
    const settlement: unknown[] = [];
    const risk: unknown[] = [];

    const humanPayload = () => {
      const base = {
        type: payload.type,
        quantity: qtyToHuman(quantity),
        symbol: payload.symbol,
        side: payload.side,
        user_id: payload.user_id,
      };
      return payload.type === 'limit' ? { ...base, price: priceToHuman(price) } : base;
    };

    const makeOrder = (qty: bigint): OpenOrder => ({
      order_id,
      side: payload.side,
      price,
      quantity: qty,
      user_id: payload.user_id,
      request_id,
      type: payload.type,
      symbol: payload.symbol,
      created_at: Date.now(),
    });

    const makeFill = (
      filled_quantity: bigint,
      fill_price: bigint,
      buy_user_id: string,
      sell_user_id: string,
      buy_order_id: string,
      sell_order_id: string,
    ): Fill => ({
      type: payload.type,
      quantity,
      filled_quantity,
      price: fill_price,
      symbol: payload.symbol,
      buy_user_id,
      sell_user_id,
      buy_order_id,
      sell_order_id,
      fill_id: this.generateId(),
      created_at: Date.now(),
      order_type: payload.side,
    });

    const humanFill = (f: Fill) => ({
      type: f.type,
      quantity: qtyToHuman(f.quantity),
      filled_quantity: qtyToHuman(f.filled_quantity),
      price: priceToHuman(f.price),
      symbol: f.symbol,
      buy_user_id: f.buy_user_id,
      sell_user_id: f.sell_user_id,
      buy_order_id: f.buy_order_id,
      sell_order_id: f.sell_order_id,
      fill_id: f.fill_id,
      created_at: f.created_at,
      order_type: f.order_type,
    });

    const recordFill = (fill: Fill): void => {
      fills.push(fill);
      settlement.push({
        fill: humanFill(fill),
        payload: humanPayload(),
        request_type,
        order_id,
        command: command || 'create-fill',
      });
      risk.push({ fill: humanFill(fill), command: 'fill-order' });
    };

    if (!market) {
      return {
        response: {
          request_id,
          order_id,
          status: 'rejected',
          message: 'Market not available on orderbook',
          price,
          filled_quantity: 0n,
          remaining_quantity: quantity,
          fills,
        },
        fills,
        settlement,
        risk,
      };
    }

    let filled = 0n;
    const isMarket = payload.type === 'market';
    const resting = this.restingOrders(market, payload.side);

    for (const o of resting) {
      if (o.user_id === payload.user_id) continue; // self-trade skip
      if (!isMarket) {
        const crosses =
          payload.side === 'buy' ? o.price <= price : o.price >= price;
        if (!crosses) break;
      }
      if (filled >= quantity) break;

      const take = o.quantity < quantity - filled ? o.quantity : quantity - filled;
      if (take <= 0n) break;

      const fill =
        payload.side === 'buy'
          ? makeFill(take, o.price, payload.user_id, o.user_id, order_id, o.order_id)
          : makeFill(take, o.price, o.user_id, payload.user_id, o.order_id, order_id);
      recordFill(fill);
      filled += take;
      this.consume(market, payload.side, o, take);
    }

    // Limit order with remaining quantity rests on the book.
    if (!isMarket && filled < quantity) {
      const restingOrder = makeOrder(quantity - filled);
      market[payload.side === 'buy' ? 'bids' : 'asks'].set(order_id, restingOrder);
      risk.push({
        order: {
          ...restingOrder,
          price: priceToHuman(restingOrder.price),
          quantity: qtyToHuman(restingOrder.quantity),
        },
        command: 'create-order',
      });
      settlement.push({
        ...humanPayload(),
        payload: humanPayload(),
        command: 'create-order',
        order_id,
        request_id,
      });
    }

    const status: OrderStatus =
      filled === 0n
        ? isMarket
          ? 'rejected'
          : 'accepted'
        : filled === quantity
          ? 'fully_filled'
          : 'partially_filled';

    // Average execution price (integer division) for market orders, the limit
    // price otherwise — both in whole units.
    const avgPrice =
      isMarket && filled > 0n
        ? fills.reduce((s, f) => s + f.price * f.filled_quantity, 0n) / filled
        : price;

    return {
      response: {
        request_id,
        order_id,
        status,
        price: avgPrice,
        filled_quantity: filled,
        remaining_quantity: quantity - filled,
        message: status === 'fully_filled' ? 'Order got filled' : status === 'partially_filled' ? 'Order partially filled' : status === 'rejected' ? 'Order rejected' : 'Sitting on orderbook',
        fills,
      },
      fills,
      settlement,
      risk,
    };
  }

  cancelOrder(orderId: string, request_id: string): EngineResult {
    const fills: Fill[] = [];
    const settlement: unknown[] = [];
    const risk: unknown[] = [];

    let order: OpenOrder | undefined;
    this.orderbook.forEach((book) => {
      book.asks.forEach((o, key) => {
        if (o.order_id === orderId) {
          order = o;
          book.asks.delete(key);
        }
      });
      book.bids.forEach((o, key) => {
        if (o.order_id === orderId) {
          order = o;
          book.bids.delete(key);
        }
      });
    });

    if (!order) {
      return {
        response: {
          request_id,
          order_id: '',
          filled_quantity: 0n,
          remaining_quantity: 0n,
          price: 0n,
          status: 'not_found',
          message: 'Order not found',
          fills,
        },
        fills,
        settlement,
        risk,
      };
    }

    risk.push({
      order: {
        ...order,
        price: priceToHuman(order.price),
        quantity: qtyToHuman(order.quantity),
      },
      command: 'cancel-order',
    });

    settlement.push({
      ...order,
      request_id,
      filled_quantity: 0,
      message: '',
      price: priceToHuman(order.price),
      quantity: qtyToHuman(order.quantity),
      fill: {},
      payload: { symbol: order.symbol },
      command: 'cancel-order',
    });

    return {
      response: {
        request_id,
        order_id: order.order_id,
        price: order.price,
        data: order,
        filled_quantity: 0n,
        remaining_quantity: order.quantity,
        status: 'cancelled',
        message: 'Order cancelled',
        fills,
      },
      fills,
      settlement,
      risk,
    };
  }

  getOrder(orderId: string, request_id: string): EngineResult {
    let order: OpenOrder | undefined;
    this.orderbook.forEach((book) => {
      book.asks.forEach((o) => {
        if (o.order_id === orderId) order = o;
      });
      book.bids.forEach((o) => {
        if (o.order_id === orderId) order = o;
      });
    });

    return {
      response: {
        request_id,
        data: order,
        status: order ? 'accepted' : 'not_found',
        message: order ? 'Order is sitting on orderbook' : 'Order not found',
        order_id: order ? order.order_id : '',
        price: order ? order.price : 0n,
        filled_quantity: 0n,
        remaining_quantity: order ? order.quantity : 0n,
        fills: [],
      },
      fills: [],
      settlement: [],
      risk: [],
    };
  }

  getBalance(_payload: unknown, _request_id: string): EngineResult {
    return { response: undefined, fills: [], settlement: [], risk: [] };
  }

  getDepth(symbol: string, request_id: string): EngineResult {
    const market = this.orderbook.get(symbol);

    const asks: [string, string][] = [];
    const bids: [string, string][] = [];

    if (market) {
      const agg_asks = new Map<string, bigint>();
      market.asks.forEach((v) => {
        const key = String(v.price);
        agg_asks.set(key, (agg_asks.get(key) ?? 0n) + v.quantity);
      });
      for (const [price, size] of [...agg_asks.entries()].sort(
        (a, b) => Number(BigInt(a[0]) - BigInt(b[0])),
      )) {
        asks.push([price, size.toString()]);
      }

      const agg_bids = new Map<string, bigint>();
      market.bids.forEach((v) => {
        const key = String(v.price);
        agg_bids.set(key, (agg_bids.get(key) ?? 0n) + v.quantity);
      });
      for (const [price, size] of [...agg_bids.entries()].sort(
        (a, b) => Number(BigInt(b[0]) - BigInt(a[0])),
      )) {
        bids.push([price, size.toString()]);
      }
    }

    const response = {
      request_id,
      symbol,
      bids,
      asks,
      timestamp: Date.now(),
    };

    return { response, fills: [], settlement: [], risk: [] };
  }

  createAsset(payload: Asset, request_id: string): EngineResult {
    const existing_ast = this.assets.find(
      (a) => a.name === payload.name || a.symbol === payload.symbol,
    );

    if (existing_ast) {
      return {
        response: { request_id, ASSETS: this.assets, ORDERBOOK: this.orderbook },
        fills: [],
        settlement: [],
        risk: [],
      };
    }

    this.assets.push(payload);
    this.orderbook.set(payload.symbol, { asks: new Map(), bids: new Map() });

    return {
      response: { request_id, ASSETS: this.assets, ORDERBOOK: this.orderbook },
      fills: [],
      settlement: [],
      risk: [],
    };
  }
}
