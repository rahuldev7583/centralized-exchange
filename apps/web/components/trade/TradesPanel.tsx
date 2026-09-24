"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useMarket } from "@/context/MarketContext";
import { wsClient } from "@/lib/ws";
import { formatPrice, formatQuantity, formatClockTime } from "@/lib/format";
import type { PublicTrade } from "@/lib/types";
import { emptyState, panel, panelHeader, panelTitle } from "@/lib/ui";

export function TradesPanel({ variant = "panel" as const }: { variant?: "panel" | "embedded" }) {
  const { selected } = useMarket();
  const symbol = selected?.symbol;
  const [trades, setTrades] = useState<PublicTrade[]>([]);

  const fetchTrades = useCallback(async () => {
    if (!symbol) return;
    try {
      const res = await api.trades(symbol);
      const list = (res.trades || []).slice(0, 20);
      setTrades(list);
    } catch {
      /* trades unavailable */
    }
  }, [symbol]);

  useEffect(() => {
    setTrades([]);
    if (!symbol) return;

    fetchTrades();

    const channel = `trades.${symbol}`;
    const unsubscribe = wsClient.subscribe(channel, (data) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const side = d.side ?? d.order_type;
      const trade: PublicTrade = {
        id: String(d.id ?? Date.now()),
        type: String(d.type ?? ""),
        price: Number(d.price ?? 0),
        quantity: Number(d.filled_quantity ?? d.quantity ?? d.size ?? 0),
        symbol,
        status: String(d.status ?? "filled"),
        created_at: String(d.created_at ?? new Date().toISOString()),
        side: side === "sell" ? "sell" : side === "buy" ? "buy" : undefined,
      };
      setTrades((prev) => [trade, ...prev].slice(0, 20));
    });

    const poll = setInterval(fetchTrades, 4000);

    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [symbol, fetchTrades]);

  const Core = (
    <div className="font-mono text-[13.5px] max-md:text-[12.5px]">
        <div className="grid grid-cols-3 border-b border-border px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-text-faint">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Time</span>
        </div>
        {trades.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className={emptyState}>No trades yet</span>
          </div>
        ) : (
          trades.map((t, i) => {
            const side = t.side === "sell" ? "sell" : "buy";
            return (
              <div className="grid grid-cols-3 px-3 py-1" key={`${t.id}-${i}`}>
                <span className={side === "sell" ? "text-down" : "text-up"}>{formatPrice(t.price)}</span>
                <span className="text-right text-text-dim">{formatQuantity(t.quantity)}</span>
                <span className="text-right text-text-faint">{formatClockTime(new Date(t.created_at).getTime())}</span>
              </div>
            );
          })
        )}
      </div>
  );

  if (variant === "embedded") return Core;

  return (
    <div className={panel}>
      <div className={panelHeader}>
        <span className={panelTitle}>Market Trades</span>
      </div>
      {Core}
    </div>
  );
}
