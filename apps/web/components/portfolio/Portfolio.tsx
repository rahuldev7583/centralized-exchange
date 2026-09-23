"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useBalance } from "@/context/BalanceContext";
import { wsClient } from "@/lib/ws";
import { useAuth } from "@/context/AuthContext";
import { formatPrice, formatQuantity } from "@/lib/format";
import type { Position } from "@/lib/types";
import {
  actionBtn,
  badge,
  badgeVariants,
  cx,
  emptyState,
  panel,
  panelHeader,
  panelTitle,
  table,
  tableWrap,
  td,
  th,
} from "@/lib/ui";

export function BalancesTable() {
  const { balances, refresh } = useBalance();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const usdc = balances.find((b) => b.asset === "USD" || b.asset === "USDC" || b.asset === "USDT");

  const totals = useMemo(() => {
    const totalUsd = balances.reduce(
      (sum, b) => sum + Number(b.available) + Number(b.locked),
      0,
    );
    return { totalUsd, usdcAvailable: Number(usdc?.available || 0), usdcLocked: Number(usdc?.locked || 0) };
  }, [balances, usdc]);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2.5 min-[520px]:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] min-[520px]:gap-3">
        <div className="rounded-xl border border-border bg-panel p-[18px] max-[520px]:p-3.5">
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-faint">Account Equity</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight max-[520px]:text-xl">${formatQuantity(totals.totalUsd)}</div>
          <div className="mt-[3px] text-[13px] text-text-dim">Sum of all balances</div>
        </div>
        <div className="rounded-xl border border-border bg-panel p-[18px] max-[520px]:p-3.5">
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-faint">USDC Available</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight max-[520px]:text-xl">${formatQuantity(totals.usdcAvailable)}</div>
          <div className="mt-[3px] text-[13px] text-text-dim">Available to trade</div>
        </div>
        <div className="rounded-xl border border-border bg-panel p-[18px] max-[520px]:p-3.5">
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-faint">USDC Locked</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight max-[520px]:text-xl">${formatQuantity(totals.usdcLocked)}</div>
          <div className="mt-[3px] text-[13px] text-text-dim">Held in open orders</div>
        </div>
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={panelTitle}>Balances</span>
          <button className={actionBtn} onClick={() => refresh()}>
            Refresh
          </button>
        </div>
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Asset</th>
                <th className={th}>Available</th>
                <th className={th}>Locked</th>
                <th className={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && (
                <tr>
                  <td colSpan={4} className={emptyState}>
                    No balances
                  </td>
                </tr>
              )}
              {balances.map((b) => (
                <tr key={b.asset}>
                  <td className={cx(td, "font-sans font-semibold")}>{b.asset}</td>
                  <td className={td}>{formatQuantity(b.available)}</td>
                  <td className={td}>{formatQuantity(b.locked)}</td>
                  <td className={td}>{formatQuantity(Number(b.available) + Number(b.locked))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PositionsTable() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.positions();
      setPositions(res.positions || []);
    } catch {
      /* not authed */
    }
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = wsClient.subscribe(`positions.${user?.user_id ?? "me"}`, load);
    const poll = setInterval(load, 5000);
    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [load, user?.user_id]);

  const totalUpnl = positions.reduce((s, p) => s + Number(p.uPnL), 0);

  return (
    <div className={panel}>
      <div className={panelHeader}>
        <span className={panelTitle}>Open Positions</span>
        <span className={cx("font-mono text-[15px]", totalUpnl >= 0 ? "text-up" : "text-down")}>
          uPnL {totalUpnl >= 0 ? "+" : ""}{formatPrice(totalUpnl)}
        </span>
      </div>
      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Market</th>
              <th className={th}>Side</th>
              <th className={th}>Size</th>
              <th className={th}>Entry</th>
              <th className={th}>Mark</th>
              <th className={th}>uPnL</th>
              <th className={th}>Margin</th>
              <th className={th}>Leverage</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr>
                <td colSpan={8} className={emptyState}>
                  No open positions
                </td>
              </tr>
            )}
            {positions.map((p) => {
              const pnl = Number(p.uPnL);
              return (
                <tr key={p.id}>
                  <td className={cx(td, "font-sans font-semibold")}>{p.symbol}</td>
                  <td className={td}>
                    <span className={cx(badge, p.side === "long" ? badgeVariants.long : badgeVariants.short)}>
                      {p.side}
                    </span>
                  </td>
                  <td className={td}>{formatQuantity(p.size)}</td>
                  <td className={td}>{formatPrice(p.entry_price)}</td>
                  <td className={td}>{formatPrice(p.mark_price)}</td>
                  <td className={cx(td, pnl >= 0 ? "text-up" : "text-down")}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                  </td>
                  <td className={td}>{formatQuantity(p.margin)}</td>
                  <td className={td}>{p.leverage}x</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
