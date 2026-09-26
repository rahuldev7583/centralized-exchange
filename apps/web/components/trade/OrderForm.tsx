"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useMarket } from "@/context/MarketContext";
import { useAuth } from "@/context/AuthContext";
import { useBalance } from "@/context/BalanceContext";
import { useToast } from "@/components/Toast";
import { formatQuantity } from "@/lib/format";
import type { OrderType, Side } from "@/lib/types";
import { usePathname, useRouter } from "next/navigation";
import {
  btnBuy,
  btnSell,
  cx,
  emptyState,
  formField,
  formHint,
  formInput,
  formLabel,
  panel,
  panelHeader,
  tab,
  tabActive,
  tabs,
} from "@/lib/ui";

const LEVERAGE_PRESETS = [1, 2, 5, 10, 20, 50];

interface Props {
  price?: number | null;
  onOrderPlaced?: () => void;
}

export function OrderForm({ price, onOrderPlaced }: Props) {
  const { selected, selectedTicker } = useMarket();
  const { isAuthed, leverage } = useAuth();
  const { balances, refresh: refreshBalance } = useBalance();
  const { toast } = useToast();
  const pathname = usePathname();
  const router = useRouter();

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
    if (!isAuthed) {
      router.push(`/auth/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
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
      <div className={cx(panel, "flex h-full flex-col")}>
        <div className={cx(emptyState, "flex min-h-0 flex-1 items-center justify-center")}>No market selected</div>
      </div>
    );
  }

  const handleLeveragePreset = async (lev: number) => {
    setLevInput(String(lev));
    if (isAuthed) await updateLeverage(lev);
  };

  return (
    <div className={cx(panel, "flex h-full flex-col")}>
      <div className={panelHeader}>
        <div className={tabs}>
          <button className={cx(tab, type === "limit" && tabActive)} onClick={() => setType("limit")}>
            Limit
          </button>
          <button className={cx(tab, type === "market" && tabActive)} onClick={() => setType("market")}>
            Market
          </button>
        </div>
        {isPerp && (
          <span className="rounded-[5px] bg-up-bg px-[7px] py-[3px] text-[11px] font-bold uppercase tracking-wider text-up">
            Perp
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
        <div className="flex">
          <button
            className={cx(
              tab,
              "flex-1 rounded-none border-b-2 py-2",
              side === "buy" ? "border-b-up text-up" : "border-b-transparent",
            )}
            onClick={() => setSide("buy")}
          >
            Buy / Long
          </button>
          <button
            className={cx(
              tab,
              "flex-1 rounded-none border-b-2 py-2",
              side === "sell" ? "border-b-down text-down" : "border-b-transparent",
            )}
            onClick={() => setSide("sell")}
          >
            Sell / Short
          </button>
        </div>

        {isPerp && (
          <div className={formField}>
            <div className={formLabel}>
              <span>Leverage</span>
              <span className={formHint}>Current: {leverage || 1}x</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="w-[76px] rounded-lg border border-border bg-bg-sunken px-2.5 py-[9px] font-mono text-[14.5px] text-text outline-none focus:border-accent"
                value={levInput}
                onChange={(e) => setLevInput(e.target.value.replace(/[^0-9.]/g, ""))}
                onBlur={() => {
                  const v = Number(levInput) || 1;
                  handleLeveragePreset(Math.min(Math.max(v, 1), 50));
                }}
                inputMode="decimal"
              />
              <div className="flex flex-wrap gap-[5px]">
                {LEVERAGE_PRESETS.map((lev) => (
                  <button
                    key={lev}
                    className={cx(
                      "cursor-pointer rounded-[7px] border border-border bg-none px-2.5 py-[7px] text-[12.5px] font-semibold text-text-dim hover:border-border-strong hover:text-text",
                      Number(levInput) === lev && "border-accent bg-accent-bg text-accent",
                    )}
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
          <div className={formField}>
            <div className={formLabel}>
              <span>Price</span>
              <span className={formHint}>{quoteSymbol}</span>
            </div>
            <input
              className={formInput}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={lastPrice ? String(lastPrice) : "0.00"}
              inputMode="decimal"
            />
          </div>
        )}

        <div className={formField}>
          <div className={formLabel}>
            <span>Amount</span>
            <span className={formHint}>{baseSymbol}</span>
          </div>
          <input
            className={formInput}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
        </div>

        <div className="flex gap-1.5">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              className="flex-1 cursor-pointer rounded-[7px] border border-border bg-none py-2 text-[13px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
              onClick={() => percentOfAvailable(p)}
            >
              {p}%
            </button>
          ))}
        </div>

        <div className={formField}>
          <div className={formLabel}>
            <span>Available</span>
            <span className={formHint}>
              {side === "buy" ? `${formatQuantity(availableQuote)} ${quoteSymbol}` : `${formatQuantity(availableBase)} ${baseSymbol}`}
            </span>
          </div>
        </div>

        <div className="mt-auto flex justify-between border-t border-border pb-0.5 pt-2.5 text-[13.5px] text-text-dim">
          <span>Est. {isPerp ? "Notional" : "Total"}</span>
          <span className="font-mono text-text">
            {notional > 0 ? `${notional.toFixed(2)} ${quoteSymbol}` : "-"}
          </span>
        </div>

        <button className={side === "buy" ? btnBuy : btnSell} onClick={submit} disabled={busy}>
          {busy
            ? "Placing..."
            : !isAuthed
              ? `Sign in to ${side === "buy" ? "Buy" : "Sell"}`
              : isPerp
              ? side === "buy"
                ? "Open Long"
                : "Open Short"
              : side === "buy"
                ? `Buy ${baseSymbol}`
                : `Sell ${baseSymbol}`}
        </button>

      </div>
    </div>
  );
}