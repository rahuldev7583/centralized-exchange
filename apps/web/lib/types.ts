export interface User {
  user_id: number;
  username: string;
}

export interface Balance {
  asset: string;
  available: string;
  locked: string;
}

export interface Market {
  id: number;
  name: string;
  symbol: string;
  base_asset_id: number;
  quote_asset_id: number;
  type: "Spot" | "Perp";
  created_at: string;
  updated_at: string;
}

export interface Ticker {
  symbol: string;
  last_price: number;
  change_24h: number;
  volume_24h: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DepthEntry {
  price: number;
  size: number;
}

export interface Depth {
  request_id?: string;
  symbol: string;
  bids: DepthEntry[];
  asks: DepthEntry[];
  timestamp: number;
}

export interface PublicTrade {
  id: string;
  type: string;
  price: number;
  quantity: number;
  symbol: string;
  status: string;
  created_at: string;
  side?: "buy" | "sell";
}

export interface Order {
  id: string;
  type: string;
  price: number;
  quantity: number;
  filled: number;
  status: string;
  side: string;
  created_at: string;
  updated_at: string;
  market_id: number;
  user_id: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  entry_price: number;
  mark_price: number;
  uPnL: number;
  margin: number;
  leverage: number;
}

export interface FundingFee {
  id: number;
  user_id: number;
  symbol: string;
  side: string;
  funding_rate: number;
  funding_fee: number;
  created_at: string;
}

export interface Liquidation {
  id: number;
  user_id: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  created_at: string;
}

export interface BalanceHistory {
  id: number;
  user_id: number;
  symbol: string;
  amount: number;
  type: string;
  created_at: string;
}

export interface FillHistory {
  id: string;
  type: string;
  price: number;
  quantity: number;
  symbol: string;
  status: string;
  created_at: string;
  ask_order_id: string;
  bid_order_id: string;
  sell_user_id: number;
  buy_user_id: number;
  side?: "buy" | "sell";
}

export interface WalletResponse {
  message: string;
  ast_balances: Balance[];
}

export type BalanceResponse = WalletResponse;

export interface AuthResponse {
  message: string;
  authToken: string;
}

export interface MeResponse {
  message: string;
  user_id: number;
  username?: string;
  leverage: number;
}

export interface TickerResponse {
  message: string;
  ticker: Ticker;
}

export interface TickersResponse {
  message: string;
  tickers: Ticker[];
}

export interface MarketsResponse {
  message: string;
  markets: Market[];
}

export interface CandlesResponse {
  message: string;
  candles: Candle[];
}

export interface DepthResponse {
  message: string;
  data: Depth;
}

export interface TradesResponse {
  message: string;
  trades: PublicTrade[];
}

export interface OrdersResponse {
  message: string;
  orders: Order[];
}

export interface FillsResponse {
  message: string;
  fills: { buy_fills: FillHistory[]; sell_fills: FillHistory[] };
}

export interface PositionsResponse {
  message: string;
  positions: Position[];
}

export interface FundingResponse {
  message: string;
  funding_fees: FundingFee[];
}

export interface LiquidationResponse {
  message: string;
  liquidations: Liquidation[];
}

export interface BalanceHistoryResponse {
  message: string;
  balance_history: BalanceHistory[];
}

export type Side = "buy" | "sell";
export type OrderType = "limit" | "market";

export interface PlaceOrderParams {
  type: OrderType;
  side: Side;
  quantity: number;
  price?: number;
  symbol: string;
}

export interface OrderResponse {
  message?: string;
  status?: string;
  data?: unknown;
}

export interface TransferResponse {
  message: string;
  currency?: string;
  amount?: number;
}

export interface CancelResponse {
  message?: string;
  data?: unknown;
}

export type Message =
  | { channel: string; type: "subscribe" | "unsubscribe" }
  | { channel: string; data: unknown };