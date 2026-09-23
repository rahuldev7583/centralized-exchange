import type {
  AuthResponse,
  BalanceHistoryResponse,
  BalanceResponse,
  CancelResponse,
  CandlesResponse,
  DepthResponse,
  FillHistory,
  FillsResponse,
  FundingResponse,
  LiquidationResponse,
  MarketsResponse,
  MeResponse,
  OrderResponse,
  OrdersResponse,
  PlaceOrderParams,
  PositionsResponse,
  TickerResponse,
  TickersResponse,
  TradesResponse,
  TransferResponse,
} from "./types";

export const API_BASE = "";

const TOKEN_KEY = "cex_auth_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as { message?: unknown; data?: unknown };
    if (typeof b.message === "string" && b.message.length > 0) return b.message;
    if (Array.isArray(b.data)) {
      const errors = b.data
        .filter((e): e is { error?: string } => typeof e === "object" && e !== null)
        .map((e) => e.error)
        .filter((e): e is string => !!e)
        .join(", ");
      if (errors) return errors;
    }
    if (b.data && typeof b.data === "object") {
      const d = b.data as { message?: unknown };
      if (typeof d.message === "string" && d.message.length > 0) return d.message;
    }
  }
  return `Request failed (${status})`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, extractError(body, res.status));
  }

  return body as T;
}

export const api = {
  signup(username: string, password: string) {
    return request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }, false);
  },
  signin(username: string, password: string) {
    return request<AuthResponse>("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }, false);
  },
  me() {
    return request<MeResponse>("/api/me", { method: "GET" });
  },

  markets() {
    return request<MarketsResponse>("/api/exchange/markets", { method: "GET" }, false);
  },
  ticker(symbol: string) {
    return request<TickerResponse>(`/api/tickers/${symbol}`, { method: "GET" }, false);
  },
  tickers() {
    return request<TickersResponse>("/api/get/tickers", { method: "GET" }, false);
  },
  candles(symbol: string, interval = "1m", limit = 300) {
    return request<CandlesResponse>(
      `/api/market/candles/${symbol}?interval=${interval}&limit=${limit}`,
      { method: "GET" },
      false,
    );
  },
  depth(symbol: string) {
    return request<DepthResponse>(`/api/exchange/depth/${symbol}`, { method: "GET" });
  },
  trades(symbol: string) {
    return request<TradesResponse>(`/api/exchange/trades/${symbol}`, { method: "GET" });
  },

  placeSpotOrder(params: PlaceOrderParams) {
    return request<OrderResponse>("/api/exchange/spot/order", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },
  placeFutureOrder(params: PlaceOrderParams) {
    return request<OrderResponse>("/api/exchange/future/order", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },
  setLeverage(leverage: number) {
    return request<OrderResponse>("/api/exchange/leverage", {
      method: "POST",
      body: JSON.stringify({ leverage }),
    });
  },
  cancelOrder(orderId: string) {
    return request<CancelResponse>(`/api/exchange/spot/order/${orderId}`, { method: "DELETE" });
  },
  orders(status?: string) {
    const suffix = status ? `/${status}` : "";
    return request<OrdersResponse>(`/api/exchange/orders${suffix}`, { method: "GET" });
  },
  fills() {
    return request<FillsResponse>("/api/exchange/fills", { method: "GET" });
  },
  positions() {
    return request<PositionsResponse>("/api/exchange/positions", { method: "GET" });
  },

  balance() {
    return request<BalanceResponse>("/api/wallet/balance", { method: "GET" });
  },
  onramp(currency: string, amount: number) {
    return request<TransferResponse>("/api/wallet/onramp", {
      method: "POST",
      body: JSON.stringify({ currency, amount }),
    });
  },
  offramp(currency: string, amount: number) {
    return request<TransferResponse>("/api/wallet/offramp", {
      method: "POST",
      body: JSON.stringify({ currency, amount }),
    });
  },

  balanceHistory() {
    return request<BalanceHistoryResponse>("/api/history/balances", { method: "GET" });
  },
  fundingHistory() {
    return request<FundingResponse>("/api/history/funding", { method: "GET" });
  },
  liquidationHistory() {
    return request<LiquidationResponse>("/api/history/liquidation", { method: "GET" });
  },

  myFills(): Promise<FillHistory[]> {
    return request<FillsResponse>("/api/exchange/fills", { method: "GET" }).then((res) => [
      ...res.fills.buy_fills.map((f) => ({ ...f, side: "buy" as const })),
      ...res.fills.sell_fills.map((f) => ({ ...f, side: "sell" as const })),
    ]);
  },
};

export function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}