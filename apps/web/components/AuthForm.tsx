"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import {
  btnBlock,
  btnPrimary,
  cx,
  formField,
  formInput,
  formLabel,
  spinner,
} from "@/lib/ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { signin, signup } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const next = searchParams.get("next") || "/trade";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "login") await signin(username.trim(), password);
      else await signup(username.trim(), password);
      toast("success", mode === "login" ? "Welcome back" : "Account created");
      router.push(next);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Something went wrong";
      toast("error", "Authentication failed", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className={formField}>
        <label className={formLabel} htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className={formInput}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={20}
        />
      </div>
      <div className={formField}>
        <label className={formLabel} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className={formInput}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={3}
          maxLength={20}
        />
      </div>
      <button className={cx(btnPrimary, btnBlock)} type="submit" disabled={busy}>
        {busy ? <span className={spinner} /> : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <div className="mt-[18px] text-center text-[14.5px] text-text-dim">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link className="cursor-pointer font-semibold text-accent" href="/auth/signup">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link className="cursor-pointer font-semibold text-accent" href="/auth/login">
              Sign in
            </Link>
          </>
        )}
      </div>
    </form>
  );
}