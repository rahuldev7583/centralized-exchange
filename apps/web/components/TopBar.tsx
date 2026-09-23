"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarket } from "@/context/MarketContext";
import { useBalance } from "@/context/BalanceContext";
import { formatPrice, formatPercent } from "@/lib/format";
import type { Market, Ticker } from "@/lib/types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { CoinIcon } from "@/components/CoinIcon";

export function MarketSelector() {
  const { tickers, selected, select, spotMarkets, perpMarkets } = useMarket();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Open + prefill from the top-bar global search
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setQuery(typeof detail === "string" ? detail : "");
      setOpen(true);
    };
    window.addEventListener("market:search", handler as EventListener);
    return () => window.removeEventListener("market:search", handler as EventListener);
  }, []);

  const tickerMap = useMemo(() => {
    const m = new Map<string, Ticker>();
    tickers.forEach((t) => m.set(t.symbol, t));
    return m;
  }, [tickers]);

  const q = query.trim().toLowerCase();
  const filter = (list: Market[]) =>
    q ? list.filter((m) => m.symbol.toLowerCase().includes(q)) : list;

  if (!selected) return null;

  const MarketRow = ({ m }: { m: Market }) => {
    const t = tickerMap.get(m.symbol);
    return (
      <button
        className={`market-row ${selected.symbol === m.symbol ? "active" : ""}`}
        onClick={() => {
          select(m.symbol);
          setOpen(false);
        }}
      >
        <CoinIcon symbol={m.symbol} size={18} />
        <span className="market-row-symbol">{m.symbol}</span>
        <span className="market-row-price">{formatPrice(t?.last_price)}</span>
        <span className={`market-row-change ${(t?.change_24h ?? 0) >= 0 ? "up-text" : "down-text"}`}>
          {formatPercent(t?.change_24h)}
        </span>
      </button>
    );
  };

  return (
    <div className="market-selector">
      <button className="market-selector-btn" onClick={() => setOpen((v) => !v)}>
        <CoinIcon symbol={selected.symbol} size={20} />
        <span className="market-symbol">{selected.symbol}</span>
        <span className="market-row-price">{formatPrice(tickerMap.get(selected.symbol)?.last_price)}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 2 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 55, background: "transparent" }}
            onClick={() => setOpen(false)}
          />
          <div className="market-dropdown">
            <div className="market-search">
              <input
                autoFocus
                placeholder="Search markets..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="market-list">
              {spotMarkets.length > 0 && (
                <div className="market-list-group">
                  <div className="market-group-label">Spot</div>
                  {filter(spotMarkets).map((m) => (
                    <MarketRow key={m.id} m={m} />
                  ))}
                </div>
              )}
              {perpMarkets.length > 0 && (
                <div className="market-list-group">
                  <div className="market-group-label">Perpetual Futures</div>
                  {filter(perpMarkets).map((m) => (
                    <MarketRow key={m.id} m={m} />
                  ))}
                </div>
              )}
              {filter(spotMarkets).length === 0 && filter(perpMarkets).length === 0 && (
                <div className="empty-state">No markets match &quot;{query}&quot;</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function NavToggle() {
  const pathname = usePathname();
  const isPortfolio = pathname.startsWith("/portfolio");
  return (
    <nav className="topbar-nav">
      <Link href="/trade">
        <span className={`nav-pill ${!isPortfolio && !pathname.startsWith("/history") ? "active" : ""}`}>Trade</span>
      </Link>
      <Link href="/portfolio">
        <span className={`nav-pill ${isPortfolio ? "active" : ""}`}>Portfolio</span>
      </Link>
      <Link href="/history">
        <span className={`nav-pill ${pathname.startsWith("/history") ? "active" : ""}`}>History</span>
      </Link>
    </nav>
  );
}

export function WalletButton() {
  const { balances } = useBalance();
  const usdc = balances.find((b) => b.asset === "USD" || b.asset === "USDC" || b.asset === "USDT");
  return (
    <Link href="/portfolio" className="wallet-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </svg>
      <span className="wallet-amount">{usdc ? Number(usdc.available).toFixed(2) : "0.00"}</span>
      <span className="wallet-currency">USD</span>
    </Link>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    // `theme` is initialized from localStorage/matchMedia on the client, so the
    // server-rendered HTML (always dark) can differ from the first client render.
    // suppressHydrationWarning lets React adopt the client-side icon instead of
    // throwing a hydration mismatch.
    <button className="icon-btn" aria-label="Toggle theme" title={isDark ? "Switch to light" : "Switch to dark"} onClick={toggleTheme} suppressHydrationWarning>
      {isDark ? (
        // Sun icon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon icon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
