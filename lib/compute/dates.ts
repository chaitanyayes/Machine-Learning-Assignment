// ISO-date helpers. All dates are "YYYY-MM-DD" strings interpreted in UTC, so
// arithmetic never shifts with the machine's time zone.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(date: string): void {
  if (!ISO.test(date)) throw new Error(`Not an ISO date: ${date}`);
}

export function toUtc(date: string): Date {
  assertIsoDate(date);
  return new Date(`${date}T00:00:00Z`);
}

export function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Adds calendar months, clamping to the last day of the target month (31 Mar − 1M = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const d = toUtc(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUtc(target);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return toUtc(date).getUTCDay();
}

/** "YYYY-MM" month key. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * Key identifying the Monday–Friday trading week a date falls in: the ISO date
 * of that week's Monday.
 */
export function weekKey(date: string): string {
  const wd = weekday(date);
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDays(date, offset);
}
