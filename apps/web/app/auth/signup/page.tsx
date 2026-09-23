import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { BackpackLogo } from "@/components/BackpackLogo";

export default function SignupPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <BackpackLogo />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Backpack Exchange</span>
        </div>
        <div className="auth-title">Create account</div>
        <div className="auth-subtitle">Start trading in under a minute.</div>
        <Suspense fallback={<div className="center-loader"><span className="spinner" /></div>}>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </div>
  );
}