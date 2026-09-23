"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useBalance } from "@/context/BalanceContext";
import { useToast } from "@/components/Toast";
import { useMarket } from "@/context/MarketContext";
import { useRouter } from "next/navigation";

export function TransferForm({ mode }: { mode: "onramp" | "offramp" }) {
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useBalance();
  const { toast } = useToast();
  const router = useRouter();
  const { tickers } = useMarket();

  const assets = Array.from(
    new Set([
      "USD",
      "USDC",
      "USDT",
      ...tickers.map((t) => t.symbol).filter((s) => s.length <= 10),
    ]),
  ).slice(0, 12);

  const isDeposit = mode === "onramp";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast("error", "Invalid amount");
      return;
    }
    setBusy(true);
    try {
      if (isDeposit) await api.onramp(currency, amt);
      else await api.offramp(currency, amt);
      toast("success", isDeposit ? "Deposit successful" : "Withdrawal successful", `${amt} ${currency}`);
      setAmount("");
      refresh();
      router.push("/portfolio");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Transaction failed";
      toast("error", isDeposit ? "Deposit failed" : "Withdrawal failed", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 440 }}>
      <div className="panel-header">
        <span className="panel-title">{isDeposit ? "Deposit" : "Withdraw"}</span>
      </div>
      <form className="order-form" onSubmit={onSubmit}>
        <div className="form-field">
          <label className="form-label" htmlFor="currency">
            Asset
          </label>
          <select
            id="currency"
            className="form-input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {assets.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="amount">
            Amount
          </label>
          <input
            id="amount"
            className="form-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            required
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : isDeposit ? `Deposit ${currency}` : `Withdraw ${currency}`}
        </button>
        <div style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>
          {isDeposit ? "Mock credit — funds are added instantly." : "Mock debit — funds are removed instantly."}
        </div>
      </form>
    </div>
  );
}