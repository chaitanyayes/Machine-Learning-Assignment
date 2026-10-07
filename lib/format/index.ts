// Display formatting shared by the UI, the context pack and scripts. Indian
// digit grouping (₹1,28,450), a true minus sign (U+2212) and "24 Jul 2026"
// dates, matching Indian brokerage apps.

export const MINUS = "−";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function grouped(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
}

function sign(value: number, decimals: number, explicitPlus: boolean): string {
  // Round first so -0.04 at 1 dp prints "0.0", not "−0.0".
  const rounded = Number(value.toFixed(decimals));
  if (rounded < 0) return MINUS;
  if (rounded > 0 && explicitPlus) return "+";
  return "";
}

/** 0.0712 → "7.1%"; with signed: "+7.1%" / "−7.1%". */
export function formatPercent(fraction: number, opts: { decimals?: number; signed?: boolean } = {}): string {
  const decimals = opts.decimals ?? 1;
  const pct = fraction * 100;
  return `${sign(pct, decimals, opts.signed ?? false)}${grouped(pct, decimals)}%`;
}

/** 128450 → "₹1,28,450"; −410 → "−₹410". */
export function formatRupees(amount: number, opts: { decimals?: number; signed?: boolean } = {}): string {
  const decimals = opts.decimals ?? 0;
  return `${sign(amount, decimals, opts.signed ?? false)}₹${grouped(amount, decimals)}`;
}

/** Plain number with Indian grouping: 24812.4 → "24,812.40" (decimals = 2). */
export function formatNumber(value: number, decimals = 2): string {
  return `${sign(value, decimals, false)}${grouped(value, decimals)}`;
}

/** "2026-07-24" → "24 Jul 2026"; withYear false → "24 Jul". */
export function formatDate(iso: string, opts: { withYear?: boolean } = {}): string {
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  if (!y || !month || !d) throw new Error(`Not an ISO date: ${iso}`);
  return opts.withYear === false ? `${Number(d)} ${month}` : `${Number(d)} ${month} ${y}`;
}
