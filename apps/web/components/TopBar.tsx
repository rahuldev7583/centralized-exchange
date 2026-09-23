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
import { cx, emptyState } from "@/lib/ui";

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
        className={cx(
          "flex w-full cursor-pointer items-center gap-2.5 border-none bg-none px-3.5 py-2.5 text-left text-[15px] text-text hover:bg-panel-hover",
          selected.symbol === m.symbol && "bg-accent-bg",
        )}
        onClick={() => {
          select(m.symbol);
          setOpen(false);
        }}
      >
        <CoinIcon symbol={m.symbol} size={18} />
        <span className="font-mono text-[14.5px] font-semibold">{m.symbol}</span>
        <span className="ml-auto font-mono text-[14.5px]">{formatPrice(t?.last_price)}</span>
        <span
          className={cx(
            "w-[76px] text-right font-mono text-[13.5px]",
            (t?.change_24h ?? 0) >= 0 ? "text-up" : "text-down",
          )}
        >
          {formatPercent(t?.change_24h)}
        </span>
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        className="flex min-w-[160px] cursor-pointer items-center gap-2.5 rounded-[10px] border border-border bg-panel px-[13px] py-[9px] text-text transition-colors hover:border-border-strong hover:bg-panel-hover max-[520px]:min-w-0 max-[520px]:px-[11px] max-[520px]:py-2"
        onClick={() => setOpen((v) => !v)}
      >
        <CoinIcon symbol={selected.symbol} size={20} />
        <span className="text-[15px] font-bold tracking-wide">{selected.symbol}</span>
        <span className="ml-auto font-mono text-[14.5px] max-[520px]:hidden">
          {formatPrice(tickerMap.get(selected.symbol)?.last_price)}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-0.5">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-[calc(100%+8px)] z-[60] w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-border bg-panel shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
            <div className="border-b border-border p-3">
              <input
                autoFocus
                placeholder="Search markets..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg-sunken px-[13px] py-[11px] text-[15px] text-text outline-none focus:border-accent"
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {spotMarkets.length > 0 && (
                <div className="border-b border-border py-1.5">
                  <div className="px-3.5 pb-1.5 pt-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-text-faint">
                    Spot
                  </div>
                  {filter(spotMarkets).map((m) => (
                    <MarketRow key={m.id} m={m} />
                  ))}
                </div>
              )}
              {perpMarkets.length > 0 && (
                <div className="border-b border-border py-1.5">
                  <div className="px-3.5 pb-1.5 pt-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-text-faint">
                    Perpetual Futures
                  </div>
                  {filter(perpMarkets).map((m) => (
                    <MarketRow key={m.id} m={m} />
                  ))}
                </div>
              )}
              {filter(spotMarkets).length === 0 && filter(perpMarkets).length === 0 && (
                <div className={emptyState}>No markets match &quot;{query}&quot;</div>
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

  const pill = (active: boolean) =>
    cx(
      "cursor-pointer rounded-[9px] border-none bg-none px-3.5 py-[9px] text-[15px] font-semibold text-text-dim transition-colors hover:bg-panel hover:text-text",
      active && "bg-panel text-text",
    );

  return (
    <nav className="ml-2 flex items-center gap-1">
      <Link href="/trade">
        <span className={pill(!isPortfolio && !pathname.startsWith("/history"))}>Trade</span>
      </Link>
      <Link href="/portfolio">
        <span className={pill(isPortfolio)}>Portfolio</span>
      </Link>
      <Link href="/history">
        <span className={pill(pathname.startsWith("/history"))}>History</span>
      </Link>
    </nav>
  );
}

export function WalletButton() {
  const { balances } = useBalance();
  const usdc = balances.find((b) => b.asset === "USD" || b.asset === "USDC" || b.asset === "USDT");
  return (
    <Link
      href="/portfolio"
      className="flex items-center gap-[9px] rounded-[10px] border border-border bg-panel px-[14px] py-[9px] text-[14.5px] text-text transition-colors hover:border-border-strong hover:bg-panel-hover max-[520px]:px-[11px]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </svg>
      <span className="font-mono font-semibold">{usdc ? Number(usdc.available).toFixed(2) : "0.00"}</span>
      <span className="text-text-dim max-[520px]:hidden">USD</span>
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
    <button
      aria-label="Toggle theme"
      title={isDark ? "Switch to light" : "Switch to dark"}
      onClick={toggleTheme}
      suppressHydrationWarning
      className="inline-flex size-[38px] cursor-pointer items-center justify-center rounded-[10px] border border-border bg-panel p-1.5 text-text-dim transition-colors hover:bg-panel-hover hover:text-text"
    >
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
