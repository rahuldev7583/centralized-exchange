"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initial = (user.username || "t").charAt(0).toUpperCase();

  return (
    <div className="user-menu-wrap">
      <button className="user-btn" onClick={() => setOpen((v) => !v)} title={user.username}>
        <span className="user-avatar">{initial}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setOpen(false)} />
          <div className="dropdown">
            <Link href="/portfolio" className="dropdown-item" onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>
              <span>Portfolio</span>
            </Link>
            <Link href="/history" className="dropdown-item" onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>
              <span>History</span>
            </Link>
            <Link href="/onramp" className="dropdown-item" onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
              <span>Deposit</span>
            </Link>
            <Link href="/offramp" className="dropdown-item" onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
              <span>Withdraw</span>
            </Link>
            <button
              className="dropdown-item danger"
              onClick={() => {
                logout();
                setOpen(false);
                router.push("/trade");
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
