"use client";

import { MarketSelector, WalletButton, ThemeToggle } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import { BackpackLogo } from "./BackpackLogo";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthed, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAuthPage = pathname.startsWith("/auth");

  useEffect(() => {
    if (!loading && !isAuthed && !isAuthPage) {
      router.push(`/auth/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, isAuthed, isAuthPage, pathname, router]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/trade" className="brand">
          <BackpackLogo />
          <span>Backpack</span>
        </Link>
        <MarketSelector />
        <div className="topbar-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            placeholder="Search markets, stocks, and more"
            onChange={(e) =>
              window.dispatchEvent(new CustomEvent("market:search", { detail: e.target.value }))
            }
          />
          <kbd className="search-kbd">/</kbd>
        </div>
        <div className="topbar-actions">
          <Link href="/onramp" className="pill pill-deposit">Deposit</Link>
          <Link href="/offramp" className="pill">Withdraw</Link>
          <button className="pill">Convert</button>
        </div>
        <div className="topbar-right">
          <ThemeToggle />
          {isAuthed ? (
            <>
              <WalletButton />
              <UserMenu />
            </>
          ) : (
            !isAuthPage && (
              <Link href="/auth/login" className="btn">
                Sign in
              </Link>
            )
          )}
        </div>
      </header>
      <div className={`content${isAuthPage ? " no-side" : ""}`}>
        {!isAuthPage && (
          <aside className="sidebar">
            <Sidebar />
          </aside>
        )}
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
