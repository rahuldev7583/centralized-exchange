"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatPrice, formatQuantity, formatTime } from "@/lib/format";
import type { BalanceHistory, FillHistory, FundingFee, Liquidation } from "@/lib/types";

type Tab = "balances" | "trades" | "funding" | "liquidations";

export function History() {
  const [tab, setTab] = useState<Tab>("balances");
  const [balances, setBalances] = useState<BalanceHistory[]>([]);
  const [trades, setTrades] = useState<FillHistory[]>([]);
  const [funding, setFunding] = useState<FundingFee[]>([]);
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, f, fu, l] = await Promise.all([
        api.balanceHistory().catch(() => null),
        api.myFills().catch(() => []),
        api.fundingHistory().catch(() => null),
        api.liquidationHistory().catch(() => null),
      ]);
      setBalances(b?.balance_history || []);
      setTrades(f.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
      setFunding(fu?.funding_fees || []);
      setLiquidations(l?.liquidations || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="tabs">
          <button className={`tab ${tab === "balances" ? "active" : ""}`} onClick={() => setTab("balances")}>
            Balances
          </button>
          <button className={`tab ${tab === "trades" ? "active" : ""}`} onClick={() => setTab("trades")}>
            Trades
          </button>
          <button className={`tab ${tab === "funding" ? "active" : ""}`} onClick={() => setTab("funding")}>
            Funding
          </button>
          <button className={`tab ${tab === "liquidations" ? "active" : ""}`} onClick={() => setTab("liquidations")}>
            Liquidations
          </button>
        </div>
        <button className="action-btn" onClick={load}>
          {loading ? <span className="spinner" /> : "Refresh"}
        </button>
      </div>

      {tab === "balances" && (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Asset</th>
                <th>Type</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-state">No balance history</td>
                </tr>
              )}
              {balances.map((b) => {
                const amt = Number(b.amount);
                return (
                  <tr key={b.id}>
                    <td>{formatTime(b.created_at)}</td>
                    <td>{b.symbol}</td>
                    <td>
                      <span className={`badge ${b.type === "deposit" ? "badge-filled" : "badge-cancelled"}`}>
                        {b.type}
                      </span>
                    </td>
                    <td className={amt >= 0 ? "up-text" : "down-text"}>
                      {amt >= 0 ? "+" : ""}{formatQuantity(amt)} {b.symbol}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "trades" && (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Market</th>
                <th>Side</th>
                <th>Type</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">No trade history</td>
                </tr>
              )}
              {trades.slice(0, 50).map((t, i) => (
                <tr key={`${t.id}-${i}`}>
                  <td>{formatTime(t.created_at)}</td>
                  <td>{t.symbol}</td>
                  <td>
                    <span className={`badge ${t.side === "buy" ? "badge-buy" : "badge-sell"}`}>
                      {t.side}
                    </span>
                  </td>
                  <td>{t.type}</td>
                  <td>{formatPrice(t.price)}</td>
                  <td>{formatQuantity(t.quantity)}</td>
                  <td>
                    <span className="badge badge-filled">{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "funding" && (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Market</th>
                <th>Side</th>
                <th>Funding Rate</th>
                <th>Fee</th>
              </tr>
            </thead>
            <tbody>
              {funding.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">No funding history</td>
                </tr>
              )}
              {funding.map((f) => {
                const fee = Number(f.funding_fee);
                return (
                  <tr key={f.id}>
                    <td>{formatTime(f.created_at)}</td>
                    <td>{f.symbol}</td>
                    <td>
                      <span className={`badge ${f.side === "long" ? "badge-long" : "badge-short"}`}>
                        {f.side}
                      </span>
                    </td>
                    <td>{formatPrice(f.funding_rate)}</td>
                    <td className={fee >= 0 ? "up-text" : "down-text"}>
                      {fee >= 0 ? "+" : ""}{fee.toFixed(6)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "liquidations" && (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Market</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {liquidations.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">No liquidations</td>
                </tr>
              )}
              {liquidations.map((l) => (
                <tr key={l.id}>
                  <td>{formatTime(l.created_at)}</td>
                  <td>{l.symbol}</td>
                  <td>
                    <span className={`badge ${l.side === "long" ? "badge-long" : "badge-short"}`}>
                      {l.side}
                    </span>
                  </td>
                  <td>{formatQuantity(l.quantity)}</td>
                  <td>{formatPrice(l.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}