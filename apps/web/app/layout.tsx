import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/context/Providers";
import { AppShell } from "@/components/AppShell";

// Backpack uses Inter across its UI, including tabular-nums for prices/quantities.
const geistSans = Inter({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Inter({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Backpack Exchange",
  description: "Spot and perpetual futures trading",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
