import { addDays, weekday } from "./dates";

// Simulated exchange calendar: weekdays minus a list of major Indian market
// holidays. Dates for 2026 festivals are approximate. The data is simulated,
// so this only needs to look plausible (no prices on Independence Day or
// Gandhi Jayanti), not match the official circular.
export const MARKET_HOLIDAYS: readonly string[] = [
  // 2023
  "2023-06-29", "2023-08-15", "2023-09-19", "2023-10-02", "2023-10-24",
  "2023-11-14", "2023-11-27", "2023-12-25",
  // 2024
  "2024-01-22", "2024-01-26", "2024-03-08", "2024-03-25", "2024-03-29",
  "2024-04-11", "2024-04-17", "2024-05-01", "2024-05-20", "2024-06-17",
  "2024-07-17", "2024-08-15", "2024-10-02", "2024-11-01", "2024-11-15",
  "2024-11-20", "2024-12-25",
  // 2025
  "2025-02-26", "2025-03-14", "2025-03-31", "2025-04-10", "2025-04-14",
  "2025-04-18", "2025-05-01", "2025-08-15", "2025-08-27", "2025-10-02",
  "2025-10-21", "2025-10-22", "2025-11-05", "2025-12-25",
  // 2026 (festival dates approximate)
  "2026-01-26", "2026-03-04", "2026-03-26", "2026-03-31", "2026-04-03",
  "2026-04-14", "2026-05-01", "2026-05-27", "2026-06-26", "2026-09-14",
  "2026-10-02",
];

const HOLIDAY_SET = new Set(MARKET_HOLIDAYS);

export function isTradingDay(date: string): boolean {
  const wd = weekday(date);
  return wd !== 0 && wd !== 6 && !HOLIDAY_SET.has(date);
}

/** All trading days in [from, to], ascending. */
export function tradingDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isTradingDay(d)) out.push(d);
  }
  return out;
}

/** The trading day `n` sessions after (n > 0) or before (n < 0) `date`. `date` must be a trading day. */
export function shiftSessions(date: string, n: number): string {
  if (!isTradingDay(date)) throw new Error(`${date} is not a trading day`);
  let d = date;
  let remaining = Math.abs(n);
  const step = n >= 0 ? 1 : -1;
  while (remaining > 0) {
    d = addDays(d, step);
    if (isTradingDay(d)) remaining--;
  }
  return d;
}
