"use client";

import { MarketSelector, WalletButton, ThemeToggle } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import { TradeXLogo } from "./TradeXLogo";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { btn, cx } from "@/lib/ui";

const MOBILE_NAV_ITEMS = [
  {
    href: "/trade",
    label: "Trade",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 15l3-4 3 3 4-6 3 4" />
      </svg>
    ),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <path d="M3 10h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
  {
    href: "/onramp",
    label: "Deposit",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M4 21h16" />
      </svg>
    ),
  },
  {
    href: "/offramp",
    label: "Withdraw",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21V9" />
        <path d="M7 14l5-5 5 5" />
        <path d="M4 3h16" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 3v6h6" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
];

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[70] grid grid-cols-5 border-t border-border bg-bg-raised pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "flex min-h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-semibold text-text-faint transition-colors [&_svg]:size-[22px]",
              active && "text-accent",
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

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
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 flex h-[60px] items-center gap-3 border-b border-border bg-bg-raised px-4 lg:gap-3.5">
        <Link href="/trade" className="flex items-center gap-2.5">
          <TradeXLogo className="text-[19px] max-md:text-[18px]" />
        </Link>
        <MarketSelector />
        <div className="ml-1.5 hidden min-w-0 flex-1 items-center gap-2 rounded-[11px] border border-border bg-panel px-3.5 py-2 text-text-faint transition-shadow focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-bg)] md:flex md:max-w-[620px] max-[1100px]:max-w-[340px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            className="w-full min-w-0 flex-1 border-none bg-transparent text-[14.5px] text-text outline-none"
            placeholder="Search markets, stocks, and more"
            onChange={(e) =>
              window.dispatchEvent(new CustomEvent("market:search", { detail: e.target.value }))
            }
          />
          <kbd className="rounded-[5px] border border-border bg-bg-sunken px-[7px] py-0.5 font-mono text-[11px] text-text-faint">/</kbd>
        </div>
        <div className="hidden gap-2 min-[1100px]:flex">
          <Link
            href="/onramp"
            className="rounded-full border border-accent bg-accent px-[15px] py-[9px] text-[14.5px] font-semibold text-white no-underline transition-colors hover:border-accent-hover hover:bg-accent-hover"
          >
            Deposit
          </Link>
          <Link
            href="/offramp"
            className="rounded-full border border-border bg-panel px-[15px] py-[9px] text-[14.5px] font-semibold text-text no-underline transition-colors hover:border-border-strong hover:bg-panel-hover"
          >
            Withdraw
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          {isAuthed ? (
            <>
              <WalletButton />
              <UserMenu />
            </>
          ) : (
            !isAuthPage && (
              <Link href="/auth/login" className={btn}>
                Sign in
              </Link>
            )
          )}
        </div>
      </header>
      <div
        className={cx(
          "grid min-h-[calc(100vh-60px)] grid-cols-1 max-lg:pb-[calc(64px+env(safe-area-inset-bottom)+8px)]",
          !isAuthPage && "lg:grid-cols-[232px_minmax(0,1fr)]",
        )}
      >
        {!isAuthPage && (
          <aside className="hidden h-full border-r border-border bg-bg lg:block">
            <Sidebar />
          </aside>
        )}
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-2.5 lg:p-4">{children}</main>
      </div>
      {!isAuthPage && <MobileNav />}
    </div>
  );
}
