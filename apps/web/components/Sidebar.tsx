"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TradeXLogo } from "./TradeXLogo";
import { cx } from "@/lib/ui";

function Item({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cx(
        "my-0.5 flex items-center gap-[11px] rounded-[10px] px-3 py-[11px] text-[15px] font-medium text-text-dim transition-colors hover:bg-panel hover:text-text",
        active && "bg-panel text-text shadow-[inset_0_0_0_1px_var(--border)]",
      )}
    >
      <span className="flex size-5 items-center justify-center" aria-hidden>
        {icon ?? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar() {
  return (
    <div className="sticky top-[60px] flex h-[calc(100vh-60px)] flex-col px-3 py-3.5">
      <div className="px-2.5 pb-3.5 pt-2 text-[13px] font-semibold text-text-dim">
        <TradeXLogo className="text-[17px]" />
      </div>

      <div className="mb-2.5">
        <div className="px-2.5 py-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text-faint">
          Main
        </div>
        <Item href="/trade" label="Trade" icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18M3 19h18" />
            <path d="M7 15l3-4 3 3 4-6 3 4" />
          </svg>
        )} />
        <Item href="/portfolio" label="Portfolio" icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="6" width="18" height="14" rx="2" />
            <path d="M3 10h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        )} />
        <Item href="/history" label="History" icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 3v6h6" />
            <path d="M12 7v5l3 2" />
          </svg>
        )} />
      </div>

      <div className="mb-2.5">
        <div className="px-2.5 py-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text-faint">
          Transfers
        </div>
        <Item href="/onramp" label="Onramp" icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        )} />
        <Item href="/offramp" label="Offramp" icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14" />
            <path d="M19 12l-7 7-7-7" />
          </svg>
        )} />
      </div>

      <div className="flex-1" />

      <div className="px-1 py-2">
        <button
          title="Collapse"
          className="flex w-full cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-panel px-3 py-2.5 text-[14px] text-text-dim"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 12h8M8 8h8M8 16h8" />
          </svg>
          <span>Collapse</span>
        </button>
      </div>
    </div>
  );
}
