// OB — Orderbook Exchange brand mark.
// An open book (the "order book") inside a Backpack-style red rounded badge.

export function BookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function OBLogo({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex flex-none items-center justify-center rounded-[9px] bg-gradient-to-br from-[#f05253] to-[#d92d2e] text-white shadow-[0_4px_14px_rgba(227,62,63,0.35)]"
      style={{ width: size, height: size }}
    >
      <BookIcon size={Math.round(size * 0.58)} />
    </span>
  );
}
