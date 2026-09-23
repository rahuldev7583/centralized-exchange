import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { OBLogo } from "@/components/OBLogo";
import { centerLoader, spinner } from "@/lib/ui";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(227,62,63,0.08),transparent)] p-5">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-panel p-9 max-md:p-[28px_22px]">
        <div className="mb-7 flex items-center gap-3">
          <OBLogo size={40} />
          <span className="text-[22px] font-extrabold tracking-tight">OB Exchange</span>
        </div>
        <div className="mb-2 text-[26px] font-bold tracking-tight">Create account</div>
        <div className="mb-[26px] text-[15px] text-text-dim">Start trading in under a minute.</div>
        <Suspense fallback={<div className={centerLoader}><span className={spinner} /></div>}>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </div>
  );
}
