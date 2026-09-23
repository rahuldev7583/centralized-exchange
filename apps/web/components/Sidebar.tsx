"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackpackIcon } from "./BackpackLogo";

function Item({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link href={href} className={`side-item ${active ? "active" : ""}`}>
      <span className="side-icon" aria-hidden>
        {icon ?? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
          </svg>
        )}
      </span>
      <span className="side-label">{label}</span>
    </Link>
  );
}

export function Sidebar() {
  return (
    <div className="side-wrap">
      <div className="side-header">
        <span className="side-brand"><BackpackIcon size={14} /> Backpack</span>
      </div>

      <div className="side-section">
        <div className="side-section-title">Main</div>
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

      <div className="side-section">
        <div className="side-section-title">Transfers</div>
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

      <div className="side-spacer" />

      <div className="side-footer">
        <button className="side-collapse" title="Collapse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 12h8M8 8h8M8 16h8" />
          </svg>
          <span>Collapse</span>
        </button>
      </div>
    </div>
  );
}
