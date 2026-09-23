"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useMarket } from "@/context/MarketContext";
import { wsClient } from "@/lib/ws";
import { formatPrice, formatQuantity } from "@/lib/format";
import type { DepthEntry } from "@/lib/types";
import { cx, emptyState, panel, panelHeader, panelTitle } from "@/lib/ui";

interface Props {
  onPriceSelect?: (price: number) => void;
  rows?: number;
  variant?: "panel" | "embedded"; // when embedded, omit outer panel + header so a parent can provide tabs/header
}

// Depth levels can arrive as { price, size } objects (REST API) or as
// [price, size] tuples (raw matching-engine / WS payloads). Accept both.
function normalizeLevels(levels: unknown): DepthEntry[] {
  if (!Array.isArray(levels)) return [];
  const out: DepthEntry[] = [];
  for (const lvl of levels) {
    let price: number;
    let size: number;
    if (Array.isArray(lvl)) {
      price = Number(lvl[0]);
      size = Number(lvl[1]);
    } else if (lvl && typeof lvl === "object") {
      price = Number((lvl as { price?: unknown }).price);
      size = Number((lvl as { size?: unknown }).size);
    } else {
      continue;
    }
    if (Number.isFinite(price) && Number.isFinite(size) && size > 0) {
      out.push({ price, size });
    }
  }
  return out;
}

export function Orderbook({ onPriceSelect, rows = 12, variant = "panel" }: Props) {
  const { selected } = useMarket();
  const symbol = selected?.symbol;
  const [bids, setBids] = useState<DepthEntry[]>([]);
  const [asks, setAsks] = useState<DepthEntry[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);

  const sortBids = useCallback((list: DepthEntry[]) =>
    [...list].sort((a, b) => b.price - a.price), []);
  const sortAsks = useCallback((list: DepthEntry[]) =>
    [...list].sort((a, b) => a.price - b.price), []);

  const fetchDepth = useCallback(async () => {
    if (!symbol) return;
    try {
      const res = await api.depth(symbol);
      const data = res.data;
      if (!data) return;
      setBids(sortBids(normalizeLevels(data.bids)));
      setAsks(sortAsks(normalizeLevels(data.asks)));
    } catch {
      /* depth unavailable */
    }
  }, [symbol, sortBids, sortAsks]);

  useEffect(() => {
    setBids([]);
    setAsks([]);
    if (!symbol) return;

    fetchDepth();

    const channel = `orderbook.${symbol}`;
    const unsubscribe = wsClient.subscribe(channel, (data) => {
      const d = (data ?? {}) as Record<string, unknown>;
      if (Array.isArray(d.bids)) setBids(sortBids(normalizeLevels(d.bids)));
      if (Array.isArray(d.asks)) setAsks(sortAsks(normalizeLevels(d.asks)));
      if (typeof d.last_price === "number") setLastPrice(d.last_price);
    });

    const poll = setInterval(fetchDepth, 3000);

    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [symbol, fetchDepth, sortBids, sortAsks]);

  const { visibleBids, visibleAsks, spread, maxTotal, mid } = useMemo(() => {
    const vb = bids.slice(0, rows);
    const va = asks.slice(0, rows);

    let bidTotal = 0;
    const bidCum: number[] = vb.map((b) => {
      bidTotal += b.size;
      return bidTotal;
    });
    let askTotal = 0;
    const askCum: number[] = va.map((a) => {
      askTotal += a.size;
      return askTotal;
    });

    const maxBid = bidCum[bidCum.length - 1] || 0;
    const maxAsk = askCum[askCum.length - 1] || 0;
    const maxTotal = Math.max(maxBid, maxAsk, 1);

    const bestBid = vb.length ? (vb[0]?.price ?? null) : null;
    const bestAsk = va.length ? (va[0]?.price ?? null) : null;
    const mid =
      bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
    const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;

    // Pad to a fixed row count so the panel height stays constant
    // regardless of how many levels the book currently has.
    // Asks are padded at the top, bids at the bottom, so real levels
    // always sit next to the spread.
    const paddedAsks: (DepthEntry | null)[] = [
      ...Array<DepthEntry | null>(Math.max(0, rows - va.length)).fill(null),
      ...va,
    ];
    const paddedBids: (DepthEntry | null)[] = [
      ...vb,
      ...Array<DepthEntry | null>(Math.max(0, rows - vb.length)).fill(null),
    ];

    return { visibleBids: paddedBids, visibleAsks: paddedAsks, spread, maxTotal, mid };
  }, [bids, asks, rows]);

  if (!symbol) {
    return variant === "panel" ? (
      <div className={panel}>
        <div className={panelHeader}><span className={panelTitle}>Orderbook</span></div>
        <div className={emptyState}>No market selected</div>
      </div>
    ) : (
      <div className={emptyState}>No market selected</div>
    );
  }

  const row =
    "relative grid h-6 cursor-pointer grid-cols-3 items-center px-3 py-[3px] hover:bg-panel-hover";
  const rowEmpty = "cursor-default hover:bg-transparent";
  const depth = "absolute inset-y-0 right-0 opacity-[0.12]";
  const cell = "relative z-[1]";
  const cellRight = "relative z-[1] text-right text-text-dim";

  const Core = (
    <div className="font-mono text-[13.5px] max-md:text-[12.5px]">
        <div className="grid grid-cols-3 border-b border-border px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-text-faint">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>

        <div>
          {(() => {
            let cum = 0;
            return visibleAsks.map((a, i) => {
              if (!a) {
                return <div key={`a-pad-${i}`} className={cx(row, rowEmpty)} />;
              }
              cum += a.size;
              return (
                <div
                  key={`a-${a.price}-${i}`}
                  className={row}
                  onClick={() => onPriceSelect?.(a.price)}
                >
                  <span className={cx(depth, "bg-down")} style={{ width: `${(cum / maxTotal) * 100}%` }} />
                  <span className={cx(cell, "text-down")}>{formatPrice(a.price)}</span>
                  <span className={cellRight}>{formatQuantity(a.size)}</span>
                  <span className={cellRight}>{formatQuantity(cum)}</span>
                </div>
              );
            });
          })()}
        </div>

        <div className="flex justify-between border-y border-border px-3 py-2 font-mono text-[12.5px] text-text-faint">
          <span>
            Spread {spread != null ? formatPrice(spread) : "-"}
          </span>
          <span>{mid != null ? formatPrice(mid) : "-"}</span>
        </div>

        <div>
          {(() => {
            let cum = 0;
            return visibleBids.map((b, i) => {
              if (!b) {
                return <div key={`b-pad-${i}`} className={cx(row, rowEmpty)} />;
              }
              cum += b.size;
              return (
                <div
                  key={`b-${b.price}-${i}`}
                  className={row}
                  onClick={() => onPriceSelect?.(b.price)}
                >
                  <span className={cx(depth, "bg-up")} style={{ width: `${(cum / maxTotal) * 100}%` }} />
                  <span className={cx(cell, "text-up")}>{formatPrice(b.price)}</span>
                  <span className={cellRight}>{formatQuantity(b.size)}</span>
                  <span className={cellRight}>{formatQuantity(cum)}</span>
                </div>
              );
            });
          })()}
        </div>

        <div className="flex justify-between border-t border-border px-3 py-2 font-mono text-[12.5px] text-text-faint">
          <span>Last</span>
          <span className={lastPrice != null ? (lastPrice >= (mid ?? lastPrice) ? "text-up" : "text-down") : ""}>
            {lastPrice != null ? formatPrice(lastPrice) : "-"}
          </span>
        </div>
      </div>
  );

  if (variant === "embedded") return Core;

  return (
    <div className={panel}>
      <div className={panelHeader}>
        <span className={panelTitle}>Orderbook</span>
        <span className="text-[12px] font-bold tracking-wide">{symbol}</span>
      </div>
      {Core}
    </div>
  );
}
