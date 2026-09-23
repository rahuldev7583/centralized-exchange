"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useMarket } from "@/context/MarketContext";
import { wsClient } from "@/lib/ws";
import { formatPrice, formatQuantity, formatClockTime } from "@/lib/format";
import type { PublicTrade } from "@/lib/types";

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
    <div className="trades-list">
        <div className="trades-head">
          <span>Price</span>
          <span style={{ textAlign: "right" }}>Size</span>
          <span style={{ textAlign: "right" }}>Time</span>
        </div>
        {trades.length === 0 ? (
          <div className="empty-state">No trades yet</div>
        ) : (
          trades.map((t, i) => {
            const side = t.side === "sell" ? "sell" : "buy";
            return (
              <div className="trades-row" key={`${t.id}-${i}`}>
                <span className={`tr-price ${side}`}>{formatPrice(t.price)}</span>
                <span className="tr-size">{formatQuantity(t.quantity)}</span>
                <span className="tr-time">{formatClockTime(new Date(t.created_at).getTime())}</span>
              </div>
            );
          })
        )}
      </div>
  );

  if (variant === "embedded") return Core;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Market Trades</span>
      </div>
      {Core}
    </div>
  );
}
