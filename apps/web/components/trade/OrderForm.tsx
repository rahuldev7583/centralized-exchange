"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useMarket } from "@/context/MarketContext";
import { useAuth } from "@/context/AuthContext";
import { useBalance } from "@/context/BalanceContext";
import { useToast } from "@/components/Toast";
import { formatQuantity } from "@/lib/format";
import type { OrderType, Side } from "@/lib/types";

const LEVERAGE_PRESETS = [1, 2, 5, 10, 20, 50];

interface Props {
  price?: number | null;
  onOrderPlaced?: () => void;
}

export function OrderForm({ price, onOrderPlaced }: Props) {
  const { selected, selectedTicker } = useMarket();
  const { isAuthed, leverage, user } = useAuth();
  const { balances, refresh: refreshBalance } = useBalance();
  const { toast } = useToast();

  const isPerp = selected?.type === "Perp";

  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("limit");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [levInput, setLevInput] = useState(String(leverage || 1));
  const [busy, setBusy] = useState(false);

  const symbol = selected?.symbol;

  useEffect(() => {
    setLevInput(String(leverage || 1));
  }, [leverage]);

  useEffect(() => {
    setQuantity("");
    setLimitPrice("");
  }, [symbol, isPerp]);

  useEffect(() => {
    if (price != null && price > 0) {
      setLimitPrice(String(price));
    }
  }, [price]);

  const baseSymbol = symbol?.split("_")[0];
  const quoteSymbol = symbol?.split("_")[1] || "USD";

  const baseBalance = useMemo(
    () => balances.find((b) => b.asset.toUpperCase() === baseSymbol?.toUpperCase()),
    [balances, baseSymbol],
  );
  const quoteBalance = useMemo(
    () => balances.find((b) => b.asset.toUpperCase() === quoteSymbol?.toUpperCase()),
    [balances, quoteSymbol],
  );

  const availableBase = Number(baseBalance?.available || 0);
  const availableQuote = Number(quoteBalance?.available || 0);

  const lastPrice = price ?? selectedTicker?.last_price;

  const notional = useMemo(() => {
    const q = Number(quantity) || 0;
    if (type === "market") return q * (lastPrice || 0);
    return q * (Number(limitPrice) || 0);
  }, [quantity, type, limitPrice, lastPrice]);

  const percentOfAvailable = useCallback(
    (pct: number) => {
      if (type === "market") {
        const q = ((availableQuote / (lastPrice || 1)) * pct) / 100;
        setQuantity(q > 0 ? q.toFixed(6) : "");
        return;
      }
      const price = Number(limitPrice) || lastPrice || 0;
      if (price <= 0) return;
      if (side === "buy") {
        const q = ((availableQuote * pct) / 100 / price).toFixed(6);
        setQuantity(q);
      } else {
        const q = ((availableBase * pct) / 100).toFixed(6);
        setQuantity(q);
      }
    },
    [type, side, availableQuote, availableBase, lastPrice, limitPrice],
  );

  const updateLeverage = useCallback(
    async (lev: number) => {
      if (!isPerp || !isAuthed) return;
      try {
        await api.setLeverage(lev);
        setLevInput(String(lev));
        toast("success", "Leverage updated", `${lev}x`);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Failed to update leverage";
        toast("error", "Leverage update failed", msg);
      }
    },
    [isPerp, isAuthed, toast],
  );

  const submit = async () => {
    if (!symbol || busy) return;
    const q = Number(quantity);
    if (!q || q <= 0) {
      toast("error", "Invalid quantity");
      return;
    }
    if (type === "limit" && (!Number(limitPrice) || Number(limitPrice) <= 0)) {
      toast("error", "Invalid price");
      return;
    }

    setBusy(true);
    try {
      const params = {
        type,
        side,
        quantity: q,
        symbol,
        ...(type === "limit" ? { price: Number(limitPrice) } : {}),
      };

      const res = isPerp ? await api.placeFutureOrder(params) : await api.placeSpotOrder(params);

      toast("success", `${isPerp ? "Perp" : "Spot"} ${side} order placed`, res?.message);
      setQuantity("");
      onOrderPlaced?.();
      setTimeout(() => refreshBalance(), 800);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Order failed";
      toast("error", "Order rejected", msg);
    } finally {
      setBusy(false);
    }
  };

  if (!selected) {
    return (
      <div className="panel">
        <div className="empty-state">No market selected</div>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Place Order</span>
        </div>
        <div className="empty-state">Sign in to place orders</div>
      </div>
    );
  }

  const handleLeveragePreset = async (lev: number) => {
    setLevInput(String(lev));
    if (isAuthed) await updateLeverage(lev);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="tabs">
          <button className={`tab ${type === "limit" ? "active" : ""}`} onClick={() => setType("limit")}>
            Limit
          </button>
          <button className={`tab ${type === "market" ? "active" : ""}`} onClick={() => setType("market")}>
            Market
          </button>
        </div>
        {isPerp && (
          <span className="market-type-tag perp">Perp</span>
        )}
      </div>

      <div className="order-form">
        <div className="tabs" style={{ gap: 0 }}>
          <button
            className={`tab tab-buy ${side === "buy" ? "active" : ""}`}
            onClick={() => setSide("buy")}
            style={{ flex: 1, padding: "8px 0", borderBottom: side === "buy" ? "2px solid var(--up)" : "none" }}
          >
            Buy / Long
          </button>
          <button
            className={`tab tab-sell ${side === "sell" ? "active" : ""}`}
            onClick={() => setSide("sell")}
            style={{ flex: 1, padding: "8px 0", borderBottom: side === "sell" ? "2px solid var(--down)" : "none" }}
          >
            Sell / Short
          </button>
        </div>

        {isPerp && (
          <div className="form-field">
            <div className="form-label">
              <span>Leverage</span>
              <span className="form-hint">Current: {leverage || 1}x</span>
            </div>
            <div className="leverage-row">
              <input
                className="leverage-input"
                value={levInput}
                onChange={(e) => setLevInput(e.target.value.replace(/[^0-9.]/g, ""))}
                onBlur={() => {
                  const v = Number(levInput) || 1;
                  handleLeveragePreset(Math.min(Math.max(v, 1), 50));
                }}
                inputMode="decimal"
              />
              <div className="leverage-presets">
                {LEVERAGE_PRESETS.map((lev) => (
                  <button
                    key={lev}
                    className={`leverage-preset ${Number(levInput) === lev ? "active" : ""}`}
                    onClick={() => handleLeveragePreset(lev)}
                  >
                    {lev}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {type === "limit" && (
          <div className="form-field">
            <div className="form-label">
              <span>Price</span>
              <span className="form-hint">{quoteSymbol}</span>
            </div>
            <input
              className="form-input"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={lastPrice ? String(lastPrice) : "0.00"}
              inputMode="decimal"
            />
          </div>
        )}

        <div className="form-field">
          <div className="form-label">
            <span>Amount</span>
            <span className="form-hint">{baseSymbol}</span>
          </div>
          <input
            className="form-input"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
        </div>

        <div className="percent-row">
          {[25, 50, 75, 100].map((p) => (
            <button key={p} className="percent-btn" onClick={() => percentOfAvailable(p)}>
              {p}%
            </button>
          ))}
        </div>

        <div className="form-field">
          <div className="form-label">
            <span>Available</span>
            <span className="form-hint">
              {side === "buy" ? `${formatQuantity(availableQuote)} ${quoteSymbol}` : `${formatQuantity(availableBase)} ${baseSymbol}`}
            </span>
          </div>
        </div>

        <div className="order-total">
          <span>Est. {isPerp ? "Notional" : "Total"}</span>
          <span className="order-total-value">
            {notional > 0 ? `${notional.toFixed(2)} ${quoteSymbol}` : "-"}
          </span>
        </div>

        <button className={side === "buy" ? "btn-buy" : "btn-sell"} onClick={submit} disabled={busy}>
          {busy
            ? "Placing..."
            : isPerp
              ? side === "buy"
                ? "Open Long"
                : "Open Short"
              : side === "buy"
                ? `Buy ${baseSymbol}`
                : `Sell ${baseSymbol}`}
        </button>

        {user && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
            Signed in as {user.username}
          </div>
        )}
      </div>
    </div>
  );
}