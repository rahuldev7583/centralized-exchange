"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarket } from "@/context/MarketContext";
import { CoinIcon } from "@/components/CoinIcon";
import { Chart } from "@/components/trade/Chart";
import { BookTrades } from "@/components/trade/BookTrades";
import { OrderForm } from "@/components/trade/OrderForm";
import { OrdersAndPositions } from "@/components/trade/OrdersAndPositions";
import { formatPrice, formatPercent, formatCompact } from "@/lib/format";

export default function TradePage({ params }: { params: { symbol?: string } }) {
  const { selected, select, selectedTicker, refresh } = useMarket();
  const symbolParam = params?.symbol;
  const [price, setPrice] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (symbolParam) select(symbolParam);
  }, [symbolParam, select]);

  useEffect(() => {
    if (selectedTicker?.last_price != null) setPrice(Number(selectedTicker.last_price));
  }, [selectedTicker?.last_price]);

  useEffect(() => {
    const poll = setInterval(() => refresh(), 5000);
    return () => clearInterval(poll);
  }, [refresh]);

  const stats = useMemo(() => {
    if (!selected) return null;
    const t = selectedTicker;
    const base = selected.symbol.split("_")[0];
    return {
      base,
      last: t?.last_price ?? price,
      change: t?.change_24h ?? 0,
      volume: t?.volume_24h ?? 0,
    };
  }, [selected, selectedTicker, price]);

  if (!selected) {
    return (
      <div className="center-loader">
        <span className="spinner" />
        Loading markets...
      </div>
    );
  }

  const isPerp = selected.type === "Perp";
  const changeUp = (stats?.change ?? 0) >= 0;

  return (
    <div>
      <div className="trade-header">
        <div className="trade-price-block">
          <span style={{ display: "inline-flex", alignSelf: "center" }}>
            <CoinIcon symbol={selected.symbol} size={28} />
          </span>
          <span className="trade-price" style={{ color: changeUp ? "var(--up)" : "var(--down)" }}>
            {formatPrice(stats?.last)}
          </span>
          <span className={`stat-value ${changeUp ? "up-text" : "down-text"}`} style={{ fontSize: 14 }}>
            {formatPercent(stats?.change)}
          </span>
        </div>
        <div className="trade-stats">
          <div className="stat-item">
            <span className="stat-label">24h Volume</span>
            <span className="stat-value">{formatCompact(stats?.volume)} {stats?.base}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Instrument</span>
            <span className="stat-value">{isPerp ? "Perpetual" : "Spot"}</span>
          </div>
        </div>
      </div>

      <div className="trade-grid">
        <div className="trade-chart-col">
          <Chart />
        </div>

        <div className="trade-book-col">
          <BookTrades onPriceSelect={(p) => setPrice(p)} />
        </div>

        <div className="trade-side-col" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <OrderForm price={price} onOrderPlaced={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      <div className="trade-bottom">
        <OrdersAndPositions refreshKey={refreshKey} />
      </div>
    </div>
  );
}
