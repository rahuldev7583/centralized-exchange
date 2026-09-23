"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatPrice, formatQuantity, formatTime } from "@/lib/format";
import type { BalanceHistory, FillHistory, FundingFee, Liquidation } from "@/lib/types";
import {
  actionBtn,
  badge,
  badgeVariants,
  cx,
  emptyState,
  panel,
  panelHeader,
  spinner,
  tab,
  table,
  tableWrap,
  tabs,
  tabActive,
  td,
  th,
} from "@/lib/ui";

type Tab = "balances" | "trades" | "funding" | "liquidations";

export function History() {
  const [tab_, setTab] = useState<Tab>("balances");
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
    <div className={panel}>
      <div className={panelHeader}>
        <div className={tabs}>
          <button className={cx(tab, tab_ === "balances" && tabActive)} onClick={() => setTab("balances")}>
            Balances
          </button>
          <button className={cx(tab, tab_ === "trades" && tabActive)} onClick={() => setTab("trades")}>
            Trades
          </button>
          <button className={cx(tab, tab_ === "funding" && tabActive)} onClick={() => setTab("funding")}>
            Funding
          </button>
          <button className={cx(tab, tab_ === "liquidations" && tabActive)} onClick={() => setTab("liquidations")}>
            Liquidations
          </button>
        </div>
        <button className={actionBtn} onClick={load}>
          {loading ? <span className={spinner} /> : "Refresh"}
        </button>
      </div>

      {tab_ === "balances" && (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Asset</th>
                <th className={th}>Type</th>
                <th className={th}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && (
                <tr>
                  <td colSpan={4} className={emptyState}>No balance history</td>
                </tr>
              )}
              {balances.map((b) => {
                const amt = Number(b.amount);
                return (
                  <tr key={b.id}>
                    <td className={td}>{formatTime(b.created_at)}</td>
                    <td className={td}>{b.symbol}</td>
                    <td className={td}>
                      <span className={cx(badge, b.type === "deposit" ? badgeVariants.filled : badgeVariants.cancelled)}>
                        {b.type}
                      </span>
                    </td>
                    <td className={cx(td, amt >= 0 ? "text-up" : "text-down")}>
                      {amt >= 0 ? "+" : ""}{formatQuantity(amt)} {b.symbol}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab_ === "trades" && (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Market</th>
                <th className={th}>Side</th>
                <th className={th}>Type</th>
                <th className={th}>Price</th>
                <th className={th}>Qty</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 && (
                <tr>
                  <td colSpan={7} className={emptyState}>No trade history</td>
                </tr>
              )}
              {trades.slice(0, 50).map((t, i) => (
                <tr key={`${t.id}-${i}`}>
                  <td className={td}>{formatTime(t.created_at)}</td>
                  <td className={td}>{t.symbol}</td>
                  <td className={td}>
                    <span className={cx(badge, t.side === "buy" ? badgeVariants.buy : badgeVariants.sell)}>
                      {t.side}
                    </span>
                  </td>
                  <td className={td}>{t.type}</td>
                  <td className={td}>{formatPrice(t.price)}</td>
                  <td className={td}>{formatQuantity(t.quantity)}</td>
                  <td className={td}>
                    <span className={cx(badge, badgeVariants.filled)}>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab_ === "funding" && (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Market</th>
                <th className={th}>Side</th>
                <th className={th}>Funding Rate</th>
                <th className={th}>Fee</th>
              </tr>
            </thead>
            <tbody>
              {funding.length === 0 && (
                <tr>
                  <td colSpan={5} className={emptyState}>No funding history</td>
                </tr>
              )}
              {funding.map((f) => {
                const fee = Number(f.funding_fee);
                return (
                  <tr key={f.id}>
                    <td className={td}>{formatTime(f.created_at)}</td>
                    <td className={td}>{f.symbol}</td>
                    <td className={td}>
                      <span className={cx(badge, f.side === "long" ? badgeVariants.long : badgeVariants.short)}>
                        {f.side}
                      </span>
                    </td>
                    <td className={td}>{formatPrice(f.funding_rate)}</td>
                    <td className={cx(td, fee >= 0 ? "text-up" : "text-down")}>
                      {fee >= 0 ? "+" : ""}{fee.toFixed(6)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab_ === "liquidations" && (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Market</th>
                <th className={th}>Side</th>
                <th className={th}>Qty</th>
                <th className={th}>Price</th>
              </tr>
            </thead>
            <tbody>
              {liquidations.length === 0 && (
                <tr>
                  <td colSpan={5} className={emptyState}>No liquidations</td>
                </tr>
              )}
              {liquidations.map((l) => (
                <tr key={l.id}>
                  <td className={td}>{formatTime(l.created_at)}</td>
                  <td className={td}>{l.symbol}</td>
                  <td className={td}>
                    <span className={cx(badge, l.side === "long" ? badgeVariants.long : badgeVariants.short)}>
                      {l.side}
                    </span>
                  </td>
                  <td className={td}>{formatQuantity(l.quantity)}</td>
                  <td className={td}>{formatPrice(l.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
