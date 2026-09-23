import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { BackpackLogo } from "@/components/BackpackLogo";

export default function LoginPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <BackpackLogo />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Backpack Exchange</span>
        </div>
        <div className="auth-title">Sign in</div>
        <div className="auth-subtitle">Trade spot and perpetual futures.</div>
        <Suspense fallback={<div className="center-loader"><span className="spinner" /></div>}>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </div>
  );
}