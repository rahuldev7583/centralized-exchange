

export type Side = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
export type OrderStatus = 'filled' | 'partially_filled' | 'cancelled';
export type RequestStatus =
  | 'order accepted'
  | 'order rejected'
  | 'order pending'
  | 'order cancelled';
export type EngineStatus = 'pending' | 'ready' | 'down';

export interface OpenOrder {
  order_id: string;
  side: Side;
  price: number;
  quantity: number;
  user_id: string;
  request_id: string;
  type: OrderType;
  symbol: string;
  created_at: number;
}

export interface Fill {
  type: OrderType;
  quantity: number;
  filled_quantity: number;
  price: number;
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
  price: number;
  quantity: number;
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
  price: number;
  quantity: number;
  user_id: string;
}

export interface EngineResponse {
  request_id: string;
  order_id: string;
  status: RequestStatus;
  message: string;
  price: number;
  filled_quantity: number;
  data?: unknown;
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

  createOrder(
    payload: OrderInput,
    request_id: string,
    options: CreateOrderOptions = {},
  ): EngineResult {
    const { request_type, command } = options;
    const order_id = this.generateId();
    const market = this.orderbook.get(payload.symbol);

    const fills: Fill[] = [];
    const settlement: unknown[] = [];
    const risk: unknown[] = [];

    const makeOrder = (quantity: number): OpenOrder => ({
      order_id,
      side: payload.side,
      price: payload.price,
      quantity,
      user_id: payload.user_id,
      request_id,
      type: payload.type,
      symbol: payload.symbol,
      created_at: Date.now(),
    });

    const makeFill = (
      filled_quantity: number,
      price: number,
      buy_user_id: string,
      sell_user_id: string,
      buy_order_id: string,
      sell_order_id: string,
    ): Fill => ({
      type: payload.type,
      quantity: payload.quantity,
      filled_quantity,
      price,
      symbol: payload.symbol,
      buy_user_id,
      sell_user_id,
      buy_order_id,
      sell_order_id,
      fill_id: this.generateId(),
      created_at: Date.now(),
      order_type: payload.side,
    });

    const recordFill = (fill: Fill): void => {
      fills.push(fill);
      settlement.push({
        fill,
        payload,
        request_type,
        order_id,
        command: command || 'create-fill',
      });
      risk.push({ fill, command: 'fill-order' });
    };

    if (!market) {
      const res_data: EngineResponse = {
        request_id,
        order_id,
        status: 'order rejected',
        message: 'Market not available on orderbook',
        price: payload.price,
        filled_quantity: 0,
      };
      return { response: res_data, fills, settlement, risk };
    }

    if (payload.type === 'market') {
      if (payload.side === 'buy') {
        let lowest_price = 0;
        let lowest_order = '';
        let notional_sum = 0;

        if (market.asks.size > 0) {
          for (const [key, value] of market.asks.entries()) {
            if (lowest_price === 0 && value.user_id !== payload.user_id) {
              lowest_price = value.price;
              lowest_order = key;
            } else if (
              value.price <= lowest_price &&
              value.user_id !== payload.user_id
            ) {
              lowest_price = value.price;
              lowest_order = key;
            }
          }
        }

        let filled_quantity = 0;

        market.asks.forEach((k, v) => {
          if (k.price <= lowest_price && k.user_id !== payload.user_id) {
            lowest_price = k.price;
            lowest_order = v;

            if (filled_quantity < payload.quantity) {
              if (k.quantity > payload.quantity - filled_quantity) {
                const current_ast = market.asks.get(v)!;
                const delta_qty = payload.quantity - filled_quantity;
                notional_sum += lowest_price * delta_qty;

                const fill = makeFill(
                  delta_qty,
                  lowest_price,
                  payload.user_id,
                  current_ast.user_id,
                  order_id,
                  current_ast.order_id,
                );
                filled_quantity += delta_qty;
                recordFill(fill);

                market.asks.set(v, {
                  ...k,
                  quantity: k.quantity - delta_qty,
                });
              } else if (k.quantity <= payload.quantity - filled_quantity) {
                const current_ast = market.asks.get(v)!;
                filled_quantity += current_ast.quantity;

                const fill = makeFill(
                  current_ast.quantity,
                  lowest_price,
                  payload.user_id,
                  current_ast.user_id,
                  order_id,
                  current_ast.order_id,
                );
                recordFill(fill);
                notional_sum += lowest_price * current_ast.quantity;

                market.asks.delete(v);
              }
            }
          } else {
            let second_lowest_price = 0;
            let second_lowest_id = '';

            if (market.asks.size > 0) {
              for (const [key, value] of market.asks.entries()) {
                if (
                  second_lowest_price === 0 &&
                  value.user_id !== payload.user_id
                ) {
                  second_lowest_price = value.price;
                  second_lowest_id = key;
                } else if (
                  value.price <= second_lowest_price &&
                  value.price > lowest_price &&
                  value.user_id !== payload.user_id
                ) {
                  second_lowest_price = value.price;
                  second_lowest_id = key;
                }
              }
            }

            lowest_order = second_lowest_id;
            lowest_price = second_lowest_price;
          }
        });

        const avg_price =
          filled_quantity > 0 ? notional_sum / filled_quantity : lowest_price || 0;

        const res_data: EngineResponse = {
          request_id,
          order_id,
          price: avg_price,
          filled_quantity,
          status: 'order accepted',
          message: 'Order got filled',
        };
        return { response: res_data, fills, settlement, risk };
      } else if (payload.side === 'sell') {
        let highest_price = 0;
        let highest_order = '';
        let notional_sum = 0;

        if (market.bids.size > 0) {
          for (const [key, value] of market.bids.entries()) {
            if (highest_price === 0 && value.user_id !== payload.user_id) {
              highest_price = value.price;
              highest_order = key;
            } else if (
              value.price >= highest_price &&
              value.user_id !== payload.user_id
            ) {
              highest_price = value.price;
              highest_order = key;
            }
          }
        }

        let filled_quantity = 0;

        market.bids.forEach((k, v) => {
          if (k.price >= highest_price && k.user_id !== payload.user_id) {
            highest_price = k.price;
            highest_order = v;

            if (filled_quantity < payload.quantity) {
              if (k.quantity > payload.quantity - filled_quantity) {
                const current_ast = market.bids.get(v)!;
                const delta_qty = payload.quantity - filled_quantity;
                filled_quantity += delta_qty;

                const fill = makeFill(
                  delta_qty,
                  highest_price,
                  current_ast.user_id,
                  payload.user_id,
                  current_ast.order_id,
                  order_id,
                );
                recordFill(fill);
                notional_sum += highest_price * delta_qty;

                market.bids.set(v, {
                  ...k,
                  quantity: k.quantity - delta_qty,
                });
              } else if (k.quantity <= payload.quantity - filled_quantity) {
                const current_ast = market.bids.get(v)!;
                filled_quantity += current_ast.quantity;

                const fill = makeFill(
                  current_ast.quantity,
                  highest_price,
                  current_ast.user_id,
                  payload.user_id,
                  current_ast.order_id,
                  order_id,
                );
                recordFill(fill);
                notional_sum += highest_price * current_ast.quantity;

                market.bids.delete(v);
              }
            }
          } else {
            let second_highest_price = 0;
            let second_highest_id = '';

            if (market.bids.size > 0) {
              for (const [key, value] of market.bids.entries()) {
                if (
                  second_highest_price === 0 &&
                  value.user_id !== payload.user_id
                ) {
                  second_highest_price = value.price;
                  second_highest_id = key;
                } else if (
                  value.price >= second_highest_price &&
                  value.price < highest_price &&
                  value.user_id !== payload.user_id
                ) {
                  second_highest_price = value.price;
                  second_highest_id = key;
                }
              }
            }

            highest_order = second_highest_id;
            highest_price = second_highest_price;
          }
        });

        const avg_price =
          filled_quantity > 0 ? notional_sum / filled_quantity : highest_price || 0;

        const res_data: EngineResponse = {
          request_id,
          order_id,
          price: avg_price,
          filled_quantity,
          status: 'order accepted',
          message: 'Order got filled',
        };
        return { response: res_data, fills, settlement, risk };
      }
    } else {
      if (payload.side === 'buy') {
        let lowest_price = 0;
        let lowest_order = '';

        if (market.asks.size > 0) {
          for (const [key, value] of market.asks.entries()) {
            if (lowest_price === 0 && value.user_id !== payload.user_id) {
              lowest_price = value.price;
              lowest_order = key;
            } else if (
              value.price <= lowest_price &&
              value.user_id !== payload.user_id
            ) {
              lowest_price = value.price;
              lowest_order = key;
            }
          }
        }

        if (
          market.asks.size === 0 ||
          (market.asks.size > 0 && payload.price < lowest_price)
        ) {
          const order = makeOrder(payload.quantity);
          market.bids.set(order_id, order);

          risk.push({ order, command: 'create-order' });

          const res_data: EngineResponse = {
            request_id,
            order_id,
            price: payload.price,
            filled_quantity: 0,
            status: 'order accepted',
            message: 'Sitting on orderbook',
          };

          settlement.push({ ...res_data, payload, command: 'create-order' });

          return { response: res_data, fills, settlement, risk };
        } else {
          let total_quantity = 0;
          const matching_orders: string[] = [];

          market.asks.forEach((k, v) => {
            if (k.price <= payload.price && k.user_id !== payload.user_id) {
              if (payload.quantity > total_quantity) {
                total_quantity += k.quantity;
                matching_orders.push(v);
              }
            }
          });

          if (total_quantity >= payload.quantity) {
            let filled_quantity = 0;

            for (let i = 0; i < matching_orders.length; i++) {
              const orderKey = matching_orders[i]!;
              const current_ast = market.asks.get(orderKey)!;

              if (current_ast.quantity > payload.quantity - filled_quantity) {
                filled_quantity = payload.quantity;

                const fill = makeFill(
                  payload.quantity,
                  payload.price,
                  payload.user_id,
                  current_ast.user_id,
                  order_id,
                  current_ast.order_id,
                );
                recordFill(fill);

                market.asks.set(orderKey, {
                  ...current_ast,
                  quantity:
                    current_ast.quantity -
                    (payload.quantity - filled_quantity),
                });
              } else if (
                current_ast.quantity <=
                payload.quantity - filled_quantity
              ) {
                filled_quantity += current_ast.quantity;

                const fill = makeFill(
                  current_ast.quantity,
                  payload.price,
                  payload.user_id,
                  current_ast.user_id,
                  order_id,
                  current_ast.order_id,
                );
                recordFill(fill);

                market.asks.delete(orderKey);
              }
            }

            const res_data: EngineResponse = {
              request_id,
              order_id,
              price: payload.price,
              filled_quantity,
              status: 'order accepted',
              message: 'Order got filled',
            };
            return { response: res_data, fills, settlement, risk };
          } else {
            let filled_quantity = 0;

            for (let i = 0; i < matching_orders.length; i++) {
              const orderKey = matching_orders[i]!;
              const current_ast = market.asks.get(orderKey)!;

              if (current_ast.quantity > payload.quantity - filled_quantity) {
                market.asks.set(orderKey, {
                  ...current_ast,
                  quantity:
                    current_ast.quantity -
                    (payload.quantity - filled_quantity),
                });
                filled_quantity = payload.quantity;
              } else if (
                current_ast.quantity <=
                payload.quantity - filled_quantity
              ) {
                filled_quantity += current_ast.quantity;

                const fill = makeFill(
                  current_ast.quantity,
                  payload.price,
                  payload.user_id,
                  current_ast.user_id,
                  order_id,
                  current_ast.order_id,
                );
                recordFill(fill);

                market.asks.delete(orderKey);
              }
            }

            market.bids.set(order_id, makeOrder(payload.quantity - filled_quantity));

            const res_data: EngineResponse = {
              request_id,
              order_id,
              price: payload.price,
              filled_quantity,
              status: 'order accepted',
              message: 'Order is partially filled',
            };
            return { response: res_data, fills, settlement, risk };
          }
        }
      } else if (payload.side === 'sell') {
        let highest_price = 0;
        let highest_order = '';

        if (market.bids.size > 0) {
          for (const [key, value] of market.bids.entries()) {
            if (highest_price === 0 && value.user_id !== payload.user_id) {
              highest_price = value.price;
              highest_order = key;
            } else if (
              value.price <= highest_price &&
              value.user_id !== payload.user_id
            ) {
              highest_price = value.price;
              highest_order = key;
            }
          }
        }

        if (
          market.bids.size === 0 ||
          (market.bids.size > 0 && payload.price > highest_price)
        ) {
          const order = makeOrder(payload.quantity);
          market.asks.set(order_id, order);

          risk.push({ order, command: 'create-order' });

          const res_data: EngineResponse = {
            request_id,
            order_id,
            price: payload.price,
            filled_quantity: 0,
            status: 'order accepted',
            message: 'Sitting on orderbook',
          };

          settlement.push({ ...res_data, payload, command: 'create-order' });

          return { response: res_data, fills, settlement, risk };
        } else {
          let total_quantity = 0;
          const matching_orders: string[] = [];

          market.bids.forEach((k, v) => {
            if (k.price >= payload.price && k.user_id !== payload.user_id) {
              if (payload.quantity > total_quantity) {
                total_quantity += k.quantity;
                matching_orders.push(v);
              }
            }
          });

          if (total_quantity >= payload.quantity) {
            let filled_quantity = 0;

            for (let i = 0; i < matching_orders.length; i++) {
              const orderKey = matching_orders[i]!;
              const current_ast = market.bids.get(orderKey)!;

              if (current_ast.quantity > payload.quantity - filled_quantity) {
                market.bids.set(orderKey, {
                  ...current_ast,
                  quantity:
                    current_ast.quantity -
                    (payload.quantity - filled_quantity),
                });
                filled_quantity = payload.quantity;
              } else if (
                current_ast.quantity <=
                payload.quantity - filled_quantity
              ) {
                filled_quantity += current_ast.quantity;

                const fill = makeFill(
                  current_ast.quantity,
                  payload.price,
                  current_ast.user_id,
                  payload.user_id,
                  current_ast.order_id,
                  order_id,
                );
                recordFill(fill);

                market.bids.delete(orderKey);
              }
            }

            const res_data: EngineResponse = {
              request_id,
              order_id,
              price: payload.price,
              filled_quantity,
              status: 'order accepted',
              message: 'Order got filled',
            };
            return { response: res_data, fills, settlement, risk };
          } else {
            let filled_quantity = 0;

            for (let i = 0; i < matching_orders.length; i++) {
              const orderKey = matching_orders[i]!;
              const current_ast = market.bids.get(orderKey)!;

              if (current_ast.quantity > payload.quantity - filled_quantity) {
                market.bids.set(orderKey, {
                  ...current_ast,
                  quantity:
                    current_ast.quantity -
                    (payload.quantity - filled_quantity),
                });
                filled_quantity = payload.quantity;
              } else if (
                current_ast.quantity <=
                payload.quantity - filled_quantity
              ) {
                filled_quantity += current_ast.quantity;

                const fill = makeFill(
                  current_ast.quantity,
                  payload.price,
                  current_ast.user_id,
                  payload.user_id,
                  current_ast.order_id,
                  order_id,
                );
                recordFill(fill);

                market.bids.delete(orderKey);
              }
            }

            market.asks.set(order_id, makeOrder(payload.quantity - filled_quantity));

            const res_data: EngineResponse = {
              request_id,
              order_id,
              price: payload.price,
              filled_quantity,
              status: 'order accepted',
              message: 'Order got partially filled',
            };
            return { response: res_data, fills, settlement, risk };
          }
        }
      }
    }

    // Unreachable for valid inputs; kept to satisfy exhaustive return.
    return {
      response: {
        request_id,
        order_id,
        status: 'order rejected',
        message: 'Unknown order type',
        price: payload.price,
        filled_quantity: 0,
      } satisfies EngineResponse,
      fills,
      settlement,
      risk,
    };
  }

  cancelOrder(orderId: string, request_id: string): EngineResult {
    const fills: Fill[] = [];
    const settlement: unknown[] = [];
    const risk: unknown[] = [];

    let order: any;
    this.orderbook.forEach((book, symbol) => {
      book.asks.forEach((o, key) => {
        if (o.order_id == orderId) {
          order = o;
          this.orderbook.get(symbol)?.asks.delete(key);
        }
      });
      book.bids.forEach((o, key) => {
        if (o.order_id == orderId) {
          order = o;
          this.orderbook.get(symbol)?.bids.delete(key);
        }
      });
    });

    if (!order) {
      const res_data: EngineResponse = {
        request_id,
        order_id: '',
        filled_quantity: 0,
        price: (orderId as any).price,
        status: 'order pending',
        message: 'order not found',
      };
      return { response: res_data, fills, settlement, risk };
    }

    const res_data: EngineResponse = {
      request_id,
      order_id: order.id,
      price: (orderId as any).price,
      data: order,
      filled_quantity: 0,
      status: 'order cancelled',
      message: '',
    };

    risk.push({ order, command: 'cancel-order' });

    settlement.push({
      request_id,
      filled_quantity: 0,
      message: '',
      ...order,
      fill: {},
      payload: { symbol: order.symbol },
      command: 'cancel-order',
    });

    return { response: res_data, fills, settlement, risk };
  }

  getOrder(orderId: string, request_id: string): EngineResult {
    let order: OpenOrder | undefined;
    this.orderbook.forEach((book) => {
      book.asks.forEach((o) => {
        if (o.order_id == orderId) {
          order = o;
        }
      });
      book.bids.forEach((o) => {
        if (o.order_id == orderId) {
          order = o;
        }
      });
    });

    const res_data: EngineResponse = {
      request_id,
      data: order,
      status: 'order pending',
      message: 'Order is Sitting on orderbook',
      order_id: '',
      price: 0,
      filled_quantity: 0,
    };

    return { response: res_data, fills: [], settlement: [], risk: [] };
  }

  getBalance(_payload: unknown, _request_id: string): EngineResult {
    // TODO: return user assets by user id.
    return { response: undefined, fills: [], settlement: [], risk: [] };
  }

  getDepth(symbol: string, request_id: string): EngineResult {
    const market = this.orderbook.get(symbol);

    const asks: [number, number][] = [];
    const bids: [number, number][] = [];

    if (market) {
      const agg_asks: Record<string, number> = {};
      market.asks.forEach((v) => {
        const key = String(v.price);
        agg_asks[key] = (agg_asks[key] || 0) + v.quantity;
      });
      for (const [price, size] of Object.entries(agg_asks)) {
        asks.push([Number(price), size]);
      }

      const agg_bids: Record<string, number> = {};
      market.bids.forEach((v) => {
        const key = String(v.price);
        agg_bids[key] = (agg_bids[key] || 0) + v.quantity;
      });
      for (const [price, size] of Object.entries(agg_bids)) {
        bids.push([Number(price), size]);
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
    this.orderbook.set(payload.symbol, {
      asks: new Map(),
      bids: new Map(),
    });

    return {
      response: { request_id, ASSETS: this.assets, ORDERBOOK: this.orderbook },
      fills: [],
      settlement: [],
      risk: [],
    };
  }
}
