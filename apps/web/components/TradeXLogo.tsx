import { cx } from "@/lib/ui";

export function TradeXLogo({ className }: { className?: string }) {
  return (
    <span className={cx("select-none font-extrabold tracking-tight", className)} aria-label="TradeX" role="img">
      Trade<span className="text-accent">X</span>
    </span>
  );
}