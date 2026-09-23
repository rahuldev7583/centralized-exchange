"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarket } from "@/context/MarketContext";
import { CoinIcon } from "@/components/CoinIcon";
import { Chart } from "@/components/trade/Chart";
import { BookTrades } from "@/components/trade/BookTrades";
import { OrderForm } from "@/components/trade/OrderForm";
import { OrdersAndPositions } from "@/components/trade/OrdersAndPositions";
import { formatPrice, formatPercent, formatCompact } from "@/lib/format";
import { centerLoader, cx, spinner } from "@/lib/ui";

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
      <div className={centerLoader}>
        <span className={spinner} />
        Loading markets...
      </div>
    );
  }

  const isPerp = selected.type === "Perp";
  const changeUp = (stats?.change ?? 0) >= 0;

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5 lg:gap-3">
        <div className="flex items-baseline gap-3">
          <span className="inline-flex self-center">
            <CoinIcon symbol={selected.symbol} size={28} />
          </span>
          <span
            className={cx(
              "font-mono text-[30px] font-bold tracking-tight max-md:text-2xl max-[520px]:text-[21px]",
              changeUp ? "text-up" : "text-down",
            )}
          >
            {formatPrice(stats?.last)}
          </span>
          <span
            className={cx(
              "font-mono text-[15px]",
              changeUp ? "text-up" : "text-down",
            )}
          >
            {formatPercent(stats?.change)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 lg:gap-[22px]">
          <div className="flex flex-col gap-[3px]">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-faint">24h Volume</span>
            <span className="font-mono text-[15px]">{formatCompact(stats?.volume)} {stats?.base}</span>
          </div>
          <div className="flex flex-col gap-[3px]">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-faint">Instrument</span>
            <span className="font-mono text-[15px]">{isPerp ? "Perpetual" : "Spot"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-3 xl:grid-cols-[minmax(0,1fr)_320px_350px]">
        <div className="order-1">
          <Chart />
        </div>

        <div className="order-3 lg:order-2">
          <BookTrades onPriceSelect={(p) => setPrice(p)} />
        </div>

        <div className="order-2 flex flex-col gap-2.5 lg:order-3 lg:max-xl:col-span-2">
          <OrderForm price={price} onOrderPlaced={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      <div className="mt-3">
        <OrdersAndPositions refreshKey={refreshKey} />
      </div>
    </div>
  );
}
