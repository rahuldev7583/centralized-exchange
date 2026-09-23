"use client";

import { useState } from "react";
import { Orderbook } from "./Orderbook";
import { TradesPanel } from "./TradesPanel";

export function BookTrades({ onPriceSelect }: { onPriceSelect?: (price: number) => void }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="tabs">
          <button className={`tab ${tab === "book" ? "active" : ""}`} onClick={() => setTab("book")}>Book</button>
          <button className={`tab ${tab === "trades" ? "active" : ""}`} onClick={() => setTab("trades")}>Trades</button>
        </div>
      </div>
      {tab === "book" ? <Orderbook variant="embedded" onPriceSelect={onPriceSelect} /> : <TradesPanel variant="embedded" />}
    </div>
  );
}
