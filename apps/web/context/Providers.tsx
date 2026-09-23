"use client";

import { AuthProvider } from "./AuthContext";
import { MarketProvider } from "./MarketContext";
import { BalanceProvider } from "./BalanceContext";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "./ThemeContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ThemeProvider>
        <AuthProvider>
          <MarketProvider>
            <BalanceProvider>{children}</BalanceProvider>
          </MarketProvider>
        </AuthProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}
