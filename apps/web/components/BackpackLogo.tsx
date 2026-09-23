export function BackpackIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.5 4h5" />
      <path d="M9.5 4v2M14.5 4v2" />
      <rect x="3.5" y="7" width="17" height="13" rx="3" />
      <path d="M3.5 11.5h17" />
      <path d="M7.8 11.5v2.2M16.2 11.5v2.2" />
      <rect x="8.5" y="15" width="7" height="4.5" rx="1.5" />
    </svg>
  );
}

export function BackpackLogo({ size = 26 }: { size?: number }) {
  return (
    <span className="brand-badge" style={{ width: size, height: size }}>
      <BackpackIcon size={Math.round(size * 0.62)} />
    </span>
  );
}