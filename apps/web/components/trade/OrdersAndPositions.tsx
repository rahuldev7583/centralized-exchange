"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useMarket } from "@/context/MarketContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { wsClient } from "@/lib/ws";
import { formatPrice, formatQuantity, formatTime } from "@/lib/format";
import type { Order, Position } from "@/lib/types";
import {
  actionBtn,
  badge,
  badgeVariants,
  cx,
  emptyState,
  panel,
  panelHeader,
  tab,
  table,
  tableWrap,
  tabs,
  tabActive,
  td,
  th,
} from "@/lib/ui";

type Tab = "orders" | "positions" | "history";

export function OrdersAndPositions({ refreshKey }: { refreshKey: number }) {
  const market = useMarket();
  const { selected, isPerp } = { selected: market.selected, isPerp: market.selected?.type === "Perp" };
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab_, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const ordersRef = useRef<Order[]>([]);

  const marketSymbol = useMemo(() => {
    const m = new Map<number, string>();
    market.markets.forEach((mk) => m.set(mk.id, mk.symbol));
    return m;
  }, [market.markets]);

  const load = useCallback(async () => {
    if (!selected) return;
    try {
      const [openRes, historyRes, posRes] = await Promise.all([
        api.orders("open").catch(() => null),
        api.orders().catch(() => null),
        api.positions().catch(() => null),
      ]);
      const openOrders = openRes?.orders || [];
      ordersRef.current = openOrders;
      setOrders(openOrders);
      setHistory((historyRes?.orders || []).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
      setPositions(posRes?.positions || []);
    } catch {
      /* ignore */
    }
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    load();

    const me = `orders.${user?.user_id ?? "me"}`;
    const unsubscribeOrders = wsClient.subscribe(me, () => load());
    const unsubscribePos = wsClient.subscribe(`positions.${user?.user_id ?? "me"}`, () => load());

    const poll = setInterval(load, 5000);
    return () => {
      unsubscribeOrders();
      unsubscribePos();
      clearInterval(poll);
    };
  }, [selected, load, refreshKey, user?.user_id]);

  const cancelOrder = async (orderId: string) => {
    try {
      await api.cancelOrder(orderId);
      toast("success", "Order cancelled");
      // The engine confirms the cancel immediately, but the db-worker applies
      // the status change asynchronously. Keep polling until the order leaves
      // the open-orders list instead of relying on a single stale refetch.
      for (let i = 0; i < 6; i++) {
        await load();
        if (!ordersRef.current.some((o) => o.id === orderId)) return;
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Cancel failed";
      toast("error", "Cancel failed", msg);
    }
  };

  const statusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("cancel")) return badgeVariants.cancelled;
    if (s.includes("filled") && !s.includes("part")) return badgeVariants.filled;
    if (s.includes("part")) return badgeVariants.partially;
    return badgeVariants.open;
  };

  return (
    <div className={panel}>
      <div className={panelHeader}>
        <div className={tabs}>
          <button className={cx(tab, tab_ === "orders" && tabActive)} onClick={() => setTab("orders")}>
            Open Orders
          </button>
          <button className={cx(tab, tab_ === "positions" && tabActive)} onClick={() => setTab("positions")}>
            Positions {isPerp ? "" : "(Spot)"}
          </button>
          <button className={cx(tab, tab_ === "history" && tabActive)} onClick={() => setTab("history")}>
            History
          </button>
        </div>
      </div>

      {tab_ === "orders" && (
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
                <th className={th}>Filled</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className={emptyState}>
                    No open orders
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className={td}>{formatTime(o.created_at)}</td>
                  <td className={td}>{marketSymbol.get(o.market_id) ?? o.market_id}</td>
                  <td className={td}>
                    <span className={cx(badge, o.side === "buy" ? badgeVariants.buy : badgeVariants.sell)}>
                      {o.side}
                    </span>
                  </td>
                  <td className={td}>{o.type}</td>
                  <td className={td}>{formatPrice(o.price)}</td>
                  <td className={td}>{formatQuantity(o.quantity)}</td>
                  <td className={td}>{formatQuantity(o.filled)}</td>
                  <td className={td}>
                    <button className={actionBtn} onClick={() => cancelOrder(o.id)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab_ === "positions" && (
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
                    <td className={td}>{p.symbol}</td>
                    <td className={td}>
                      <span className={cx(badge, p.side === "long" ? badgeVariants.long : badgeVariants.short)}>
                        {p.side}
                      </span>
                    </td>
                    <td className={td}>{formatQuantity(p.size)}</td>
                    <td className={td}>{formatPrice(p.entry_price)}</td>
                    <td className={td}>{formatPrice(p.mark_price)}</td>
                    <td className={cx(td, pnl >= 0 ? "text-up" : "text-down")}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}</td>
                    <td className={td}>{formatQuantity(p.margin)}</td>
                    <td className={td}>{p.leverage}x</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab_ === "history" && (
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
              {history.length === 0 && (
                <tr>
                  <td colSpan={7} className={emptyState}>
                    No order history
                  </td>
                </tr>
              )}
              {history.slice(0, 30).map((o) => (
                <tr key={o.id}>
                  <td className={td}>{formatTime(o.created_at)}</td>
                  <td className={td}>{marketSymbol.get(o.market_id) ?? o.market_id}</td>
                  <td className={td}>
                    <span className={cx(badge, o.side === "buy" ? badgeVariants.buy : badgeVariants.sell)}>
                      {o.side}
                    </span>
                  </td>
                  <td className={td}>{o.type}</td>
                  <td className={td}>{formatPrice(o.price)}</td>
                  <td className={td}>{formatQuantity(o.quantity)}</td>
                  <td className={td}>
                    <span className={cx(badge, statusBadge(o.status))}>{o.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
