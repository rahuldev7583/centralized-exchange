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
import { api, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  leverage: number;
  loading: boolean;
  isAuthed: boolean;
  signin: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [leverage, setLeverage] = useState(1);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.me();
      setUser({ user_id: res.user_id, username: res.username || "trader" });
      setLeverage(res.leverage || 1);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const signin = useCallback(async (username: string, password: string) => {
    const res = await api.signin(username, password);
    setToken(res.authToken);
    await refreshSession();
  }, [refreshSession]);

  const signup = useCallback(async (username: string, password: string) => {
    const res = await api.signup(username, password);
    setToken(res.authToken);
    await refreshSession();
  }, [refreshSession]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setLeverage(1);
  }, []);

  const value = useMemo(
    () => ({ user, leverage, loading, isAuthed: !!user, signin, signup, logout }),
    [user, leverage, loading, signin, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}