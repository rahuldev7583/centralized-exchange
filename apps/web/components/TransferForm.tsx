"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useBalance } from "@/context/BalanceContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { usePathname, useRouter } from "next/navigation";
import {
  btnBlock,
  btnPrimary,
  cx,
  formField,
  formInput,
  formLabel,
  panel,
  panelHeader,
  panelTitle,
  spinner,
} from "@/lib/ui";

const TRANSFER_ASSETS = ["USDC", "USDT"];

export function TransferForm({ mode }: { mode: "onramp" | "offramp" }) {
  const [currency, setCurrency] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useBalance();
  const { isAuthed } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const isDeposit = mode === "onramp";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAuthed) {
      router.push(`/auth/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
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
    <div className={cx(panel, "max-w-[440px]")}>
      <div className={panelHeader}>
        <span className={panelTitle}>{isDeposit ? "Deposit" : "Withdraw"}</span>
      </div>
      <form className="flex flex-col gap-3 p-3.5" onSubmit={onSubmit}>
        <div className={formField}>
          <label className={formLabel} htmlFor="currency">
            Asset
          </label>
          <select
            id="currency"
            className={formInput}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {TRANSFER_ASSETS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className={formField}>
          <label className={formLabel} htmlFor="amount">
            Amount
          </label>
          <input
            id="amount"
            className={formInput}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            required
          />
        </div>
        <button className={cx(btnPrimary, btnBlock)} type="submit" disabled={busy}>
          {busy ? <span className={spinner} /> : isDeposit ? `Deposit ${currency}` : `Withdraw ${currency}`}
        </button>
        <div className="text-center text-[12px] text-text-faint">
          {isDeposit ? "Mock credit — funds are added instantly." : "Mock debit — funds are removed instantly."}
        </div>
      </form>
    </div>
  );
}
