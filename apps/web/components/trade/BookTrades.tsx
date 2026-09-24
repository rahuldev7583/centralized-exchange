"use client";

import { useState } from "react";
import { Orderbook } from "./Orderbook";
import { TradesPanel } from "./TradesPanel";
import { cx, panel, panelHeader, tab, tabActive, tabs, tradePanelHeight } from "@/lib/ui";

export function BookTrades({ onPriceSelect }: { onPriceSelect?: (price: number) => void }) {
  const [tab_, setTab] = useState<"book" | "trades">("book");
  return (
    <div className={cx(panel, tradePanelHeight, "flex flex-col")}>
      <div className={panelHeader}>
        <div className={tabs}>
          <button className={cx(tab, tab_ === "book" && tabActive)} onClick={() => setTab("book")}>Book</button>
          <button className={cx(tab, tab_ === "trades" && tabActive)} onClick={() => setTab("trades")}>Trades</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab_ === "book" ? <Orderbook variant="embedded" onPriceSelect={onPriceSelect} /> : <TradesPanel variant="embedded" />}
      </div>
    </div>
  );
}
