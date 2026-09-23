"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useMarket } from "@/context/MarketContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { wsClient } from "@/lib/ws";
import { formatPrice, formatQuantity, formatTime } from "@/lib/format";
import type { Order, Position } from "@/lib/types";

type Tab = "orders" | "positions" | "history";

export function OrdersAndPositions({ refreshKey }: { refreshKey: number }) {
  const market = useMarket();
  const { selected, isPerp } = { selected: market.selected, isPerp: market.selected?.type === "Perp" };
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("orders");
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
    if (s.includes("cancel")) return "badge-cancelled";
    if (s.includes("filled") && !s.includes("part")) return "badge-filled";
    if (s.includes("part")) return "badge-partially";
    return "badge-open";
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="tabs">
          <button className={`tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
            Open Orders
          </button>
          <button className={`tab ${tab === "positions" ? "active" : ""}`} onClick={() => setTab("positions")}>
            Positions {isPerp ? "" : "(Spot)"}
          </button>
          <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
            History
          </button>
        </div>
      </div>

      {tab === "orders" && (
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
                <th>Filled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-state">
                    No open orders
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{formatTime(o.created_at)}</td>
                  <td>{marketSymbol.get(o.market_id) ?? o.market_id}</td>
                  <td>
                    <span className={`badge ${o.side === "buy" ? "badge-buy" : "badge-sell"}`}>
                      {o.side}
                    </span>
                  </td>
                  <td>{o.type}</td>
                  <td>{formatPrice(o.price)}</td>
                  <td>{formatQuantity(o.quantity)}</td>
                  <td>{formatQuantity(o.filled)}</td>
                  <td>
                    <button className="action-btn" onClick={() => cancelOrder(o.id)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "positions" && (
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
                    <td>{p.symbol}</td>
                    <td>
                      <span className={`badge ${p.side === "long" ? "badge-long" : "badge-short"}`}>
                        {p.side}
                      </span>
                    </td>
                    <td>{formatQuantity(p.size)}</td>
                    <td>{formatPrice(p.entry_price)}</td>
                    <td>{formatPrice(p.mark_price)}</td>
                    <td className={pnl >= 0 ? "up-text" : "down-text"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}</td>
                    <td>{formatQuantity(p.margin)}</td>
                    <td>{p.leverage}x</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "history" && (
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
              {history.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No order history
                  </td>
                </tr>
              )}
              {history.slice(0, 30).map((o) => (
                <tr key={o.id}>
                  <td>{formatTime(o.created_at)}</td>
                  <td>{marketSymbol.get(o.market_id) ?? o.market_id}</td>
                  <td>
                    <span className={`badge ${o.side === "buy" ? "badge-buy" : "badge-sell"}`}>
                      {o.side}
                    </span>
                  </td>
                  <td>{o.type}</td>
                  <td>{formatPrice(o.price)}</td>
                  <td>{formatQuantity(o.quantity)}</td>
                  <td>
                    <span className={`badge ${statusBadge(o.status)}`}>{o.status}</span>
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