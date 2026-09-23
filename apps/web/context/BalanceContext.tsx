"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import type { Balance } from "@/lib/types";

interface BalanceContextValue {
  balances: Balance[];
  usdc: Balance | null;
  refresh: () => Promise<void>;
  loading: boolean;
}

const BalanceContext = createContext<BalanceContextValue | null>(null);

export function BalanceProvider({ children }: { children: ReactNode }) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.balance();
      setBalances(res.ast_balances || []);
    } catch {
      /* not authed or unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const usdc = useMemo(
    () => balances.find((b) => b.asset === "USD" || b.asset === "USDC" || b.asset === "USDT") || null,
    [balances],
  );

  const value = useMemo(() => ({ balances, usdc, refresh, loading }), [balances, usdc, refresh, loading]);

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

export function useBalance(): BalanceContextValue {
  const ctx = useContext(BalanceContext);
  if (!ctx) throw new Error("useBalance must be used within BalanceProvider");
  return ctx;
}