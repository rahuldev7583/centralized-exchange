"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import type { Market, Ticker } from "@/lib/types";

interface MarketContextValue {
  markets: Market[];
  tickers: Ticker[];
  selected: Market | null;
  selectedTicker: Ticker | null;
  spotMarkets: Market[];
  perpMarkets: Market[];
  select: (symbol: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

const MarketContext = createContext<MarketContextValue | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [mRes, tRes] = await Promise.all([api.markets(), api.tickers()]);
      setMarkets(mRes.markets);
      setTickers(tRes.tickers);
      if (mRes.markets.length > 0) {
        setSelectedSymbol((prev) => prev || mRes.markets[0]?.symbol || "");
      }
    } catch {
      /* markets unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const select = useCallback((symbol: string) => setSelectedSymbol(symbol), []);

  const selected = useMemo(
    () => markets.find((m) => m.symbol === selectedSymbol) || markets[0] || null,
    [markets, selectedSymbol],
  );

  const selectedTicker = useMemo(
    () => tickers.find((t) => t.symbol === selected?.symbol) || null,
    [tickers, selected],
  );

  const spotMarkets = useMemo(() => markets.filter((m) => m.type === "Spot"), [markets]);
  const perpMarkets = useMemo(() => markets.filter((m) => m.type === "Perp"), [markets]);

  const value = useMemo(
    () => ({
      markets,
      tickers,
      selected,
      selectedTicker,
      spotMarkets,
      perpMarkets,
      select,
      refresh,
      loading,
    }),
    [markets, tickers, selected, selectedTicker, spotMarkets, perpMarkets, select, refresh, loading],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarket must be used within MarketProvider");
  return ctx;
}