"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cx } from "@/lib/ui";

const itemCls =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-none px-3 py-[11px] text-left text-[15px] font-medium text-text hover:bg-panel-hover [&_svg]:text-text-dim";

export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initial = (user.username || "t").charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-panel px-[11px] py-[7px] text-[14.5px] text-text transition-colors hover:border-border-strong hover:bg-panel-hover max-[520px]:px-2"
        onClick={() => setOpen((v) => !v)}
        title={user.username}
      >
        <span className="inline-flex size-[28px] items-center justify-center rounded-full bg-gradient-to-br from-[#f05253] to-[#d92d2e] text-[13px] font-bold text-white">
          {initial}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="max-[520px]:hidden">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-[60] min-w-[200px] rounded-xl border border-border bg-panel p-[7px] shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
            <Link href="/portfolio" className={itemCls} onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>
              <span>Portfolio</span>
            </Link>
            <Link href="/history" className={itemCls} onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>
              <span>History</span>
            </Link>
            <Link href="/onramp" className={itemCls} onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
              <span>Deposit</span>
            </Link>
            <Link href="/offramp" className={itemCls} onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
              <span>Withdraw</span>
            </Link>
            <button
              className={cx(itemCls, "text-down [&_svg]:text-down")}
              onClick={() => {
                logout();
                setOpen(false);
                router.replace("/auth/login");
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
              <span>Log out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
