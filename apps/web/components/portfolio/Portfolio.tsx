"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useBalance } from "@/context/BalanceContext";
import { wsClient } from "@/lib/ws";
import { useAuth } from "@/context/AuthContext";
import { formatPrice, formatQuantity } from "@/lib/format";
import type { Position } from "@/lib/types";

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
      <div className="card-grid">
        <div className="stat-card">
          <div className="stat-card-label">Account Equity</div>
          <div className="stat-card-value">${formatQuantity(totals.totalUsd)}</div>
          <div className="stat-card-sub">Sum of all balances</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">USDC Available</div>
          <div className="stat-card-value">${formatQuantity(totals.usdcAvailable)}</div>
          <div className="stat-card-sub">Available to trade</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">USDC Locked</div>
          <div className="stat-card-value">${formatQuantity(totals.usdcLocked)}</div>
          <div className="stat-card-sub">Held in open orders</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Balances</span>
          <button className="action-btn" onClick={() => refresh()}>
            Refresh
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Available</th>
                <th>Locked</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-state">
                    No balances
                  </td>
                </tr>
              )}
              {balances.map((b) => (
                <tr key={b.asset}>
                  <td style={{ fontFamily: "var(--font-sans)", fontWeight: 600 }}>{b.asset}</td>
                  <td>{formatQuantity(b.available)}</td>
                  <td>{formatQuantity(b.locked)}</td>
                  <td>{formatQuantity(Number(b.available) + Number(b.locked))}</td>
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
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Open Positions</span>
        <span className={`stat-value ${totalUpnl >= 0 ? "up-text" : "down-text"}`}>
          uPnL {totalUpnl >= 0 ? "+" : ""}{formatPrice(totalUpnl)}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Side</th>
              <th>Size</th>
              <th>Entry</th>
              <th>Mark</th>
              <th>uPnL</th>
              <th>Margin</th>
              <th>Leverage</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-state">
                  No open positions
                </td>
              </tr>
            )}
            {positions.map((p) => {
              const pnl = Number(p.uPnL);
              return (
                <tr key={p.id}>
                  <td style={{ fontFamily: "var(--font-sans)", fontWeight: 600 }}>{p.symbol}</td>
                  <td>
                    <span className={`badge ${p.side === "long" ? "badge-long" : "badge-short"}`}>
                      {p.side}
                    </span>
                  </td>
                  <td>{formatQuantity(p.size)}</td>
                  <td>{formatPrice(p.entry_price)}</td>
                  <td>{formatPrice(p.mark_price)}</td>
                  <td className={pnl >= 0 ? "up-text" : "down-text"}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                  </td>
                  <td>{formatQuantity(p.margin)}</td>
                  <td>{p.leverage}x</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}