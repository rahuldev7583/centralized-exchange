import { Prisma, prisma } from "database";
import type { Decimal } from "database/generated/prisma/internal/prismaNamespace";
export type side = 'buy' | 'sell';
export type type = 'limit' | 'market';
export type order_status = 'filled' | 'partially_filled' | 'cancelled';

// Matching-engine contract (§2 of ENGINE_CONTRACT.md): single normalized status enum.
export type OrderStatus =
  | 'accepted'
  | 'fully_filled'
  | 'partially_filled'
  | 'cancelled'
  | 'not_found'
  | 'rejected'
  | 'self_trade_prevented';

export interface Balance {
  available: Decimal;
  locked: Decimal;
  asset_id: string,
  user_id: string
}

export interface OpenOrder {
  type: type;
  side: side;
  quantity: number;
  price: number;
  symbol: string;
  user_id: string;
  order_id: string;
  request_id: string;
  created_at: number;
}

export interface Fill {
  type: type;
  quantity: number;
  filled_quantity: number;
  price: number;
  symbol: string;
  buy_user_id: string,
  sell_user_id: string,

  buy_order_id: string;
  sell_order_id: string;
  fill_id: string;
  created_at: number;
  order_type: string
}

export interface Order {
  type: type;
  side: side;
  quantity: number;
  price: number;
  symbol: string;
  user_id: string;
  order_id: string;
  request_id: string;
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

export const ORDERBOOK = new Map<string, Orderbook>();
export const ORDERS = new Map<string, Order>();

export const FILLS: Fill[] = [];
//export const BALANCES = new Map<string, Record<string, Balance>>();
export const BALANCES: Balance[] = [];

export const ASSETS: Asset[] = [];


export const priceToBigInt18 = (number: string) => {

  const [whole, float] = number.split(".");

  console.log({ whole, float });

  const padded = float?.padEnd(18, '0').slice(0, 18);

  console.log({ padded });

  if (!whole || !float) {
    return BigInt(0)
  }

  let wh_p = whole + padded;

  console.log({ wh_p });

  return BigInt(Number(whole) + Number(padded))
}

export const scaledDecimal = (value: number, decimal: number) => {
  const base = new Prisma.Decimal(value.toString());
  const factor = new Prisma.Decimal(10).pow(decimal);

  const result = base.mul(factor);

  return result.toDecimalPlaces(0);
}

export const readableDecimal = (decimalVal: Prisma.Decimal, decimal: number) => {

  const factor = new Prisma.Decimal(10).pow(decimal);
  const result = decimalVal.div(factor)

  return result.toFixed(decimal);
}

// Matching-engine contract (§1 of ENGINE_CONTRACT.md): fixed base-unit scales.
// Price is whole quote units (10^0); quantity is fixed 18-decimal base units (10^18).
export const PRICE_DECIMALS = 0;
export const QUANTITY_DECIMALS = 18;

const power = (exp: number) => new Prisma.Decimal(10).pow(exp);

// Human decimal -> integer base units (returns a Decimal whose JSON form is the integer string).
export const toPriceUnits = (price: number | string): Prisma.Decimal =>
  new Prisma.Decimal(String(price)).mul(power(PRICE_DECIMALS)).toDecimalPlaces(0);

export const toQuantityUnits = (quantity: number | string): Prisma.Decimal =>
  new Prisma.Decimal(String(quantity)).mul(power(QUANTITY_DECIMALS)).toDecimalPlaces(0);

const trimZeros = (s: string): string => {
  if (!s.includes('.')) return s;
  let out = s.replace(/0+$/, '');
  if (out.endsWith('.')) out = out.slice(0, -1);
  return out;
};

// Integer base units -> human decimal string.
export const fromPriceUnits = (price: string | number): string =>
  trimZeros(readableDecimal(new Prisma.Decimal(String(price)), PRICE_DECIMALS));

export const fromQuantityUnits = (quantity: string | number): string =>
  trimZeros(readableDecimal(new Prisma.Decimal(String(quantity)), QUANTITY_DECIMALS));

//self correcting scheduler aligned to UTC wall clock boundaries
export const scheduleUTC = (fn: () => void, intervalMs: number) => {
  const next = () => {
    const now = Date.now();
    const next_boundary = Math.ceil(now / intervalMs) * intervalMs;
    const delay = next_boundary > now ? next_boundary - now : intervalMs;

    setTimeout(() => {
      fn();
      next();
    }, delay);
  };
  next();
}
