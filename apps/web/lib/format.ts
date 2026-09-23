export function formatNumber(value: number | string | undefined | null, decimals = 2): string {
  if (value === undefined || value === null || isNaN(Number(value))) return "-";
  const num = Number(value);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPrice(value: number | string | undefined | null): string {
  if (value === undefined || value === null || isNaN(Number(value))) return "-";
  const num = Number(value);
  if (num === 0) return "0";
  const abs = Math.abs(num);
  let decimals = 2;
  if (abs < 0.0001) decimals = 8;
  else if (abs < 0.01) decimals = 6;
  else if (abs < 1) decimals = 4;
  else if (abs < 100) decimals = 3;
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatQuantity(value: number | string | undefined | null): string {
  return formatPrice(value);
}

export function formatCompact(value: number | string | undefined | null): string {
  const num = Number(value);
  if (value === undefined || value === null || isNaN(num)) return "-";
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatPercent(value: number | string | undefined | null): string {
  const num = Number(value);
  if (value === undefined || value === null || isNaN(num)) return "-";
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
}

export function formatTime(ts: string | number | undefined | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatClockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}