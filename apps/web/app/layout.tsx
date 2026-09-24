import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/context/Providers";
import { AppShell } from "@/components/AppShell";

// TradeX uses Inter across its UI, including tabular-nums for prices/quantities.
const geistSans = Inter({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Inter({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "TradeX — Orderbook Exchange",
  description: "Spot and perpetual futures trading on TradeX",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} max-w-screen overflow-x-hidden bg-bg font-sans text-[15px] leading-[1.5] text-text antialiased tabular-nums`}
      >
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
