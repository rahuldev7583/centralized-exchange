"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/api";

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
    <form className="auth-form" onSubmit={onSubmit}>
      <div className="form-field">
        <label className="form-label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="form-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={20}
        />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="form-input"
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
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? <span className="spinner" /> : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <div className="auth-switch">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link className="auth-link" href="/auth/signup">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link className="auth-link" href="/auth/login">
              Sign in
            </Link>
          </>
        )}
      </div>
    </form>
  );
}