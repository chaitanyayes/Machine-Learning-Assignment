import { RISK } from "@/lib/config";
import { addMonths, assertIsoDate, monthKey } from "@/lib/compute/dates";
import {
  assertValidSeries,
  indexOnOrBefore,
  simpleReturn,
  type PricePoint,
  type Series,
} from "@/lib/compute/series";

// Historical risk stats for the brief's "how bumpy has this been" panel. All
// inputs are corporate-action adjusted; all outputs are unrounded fractions.

type RiskConfig = { readonly [K in keyof typeof RISK]: number };

export type MonthlyReturn = { month: string; return: number };

type Drawdown = { depth: number; peakDate: string; troughDate: string };

export type RiskHistory = {
  from: string;
  to: string;
  sessions: number;
  /** Sample stdev (n − 1) of daily log returns × √tradingDaysPerYear. */
  annualisedVol: number;
  /** Largest peak-to-trough fall; depth ≤ 0. */
  maxDrawdown: Drawdown;
  worstMonth: MonthlyReturn | null;
  /** The configured percentile of complete calendar-month returns. */
  typicalBadMonth: number | null;
  monthsUsed: number;
  rollingFalls: { windows: number; withFall: number; share: number };
};

/** Linear interpolation between closest ranks ("type 7", Excel PERCENTILE.INC). `p` in [0, 1]. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("percentile: no values");
  if (!(p >= 0 && p <= 1)) throw new Error(`percentile: p must be in [0, 1], got ${p}`);
  if (values.some((v) => !Number.isFinite(v))) throw new Error("percentile: values must be finite");
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const below = sorted[lo]!;
  const above = sorted[Math.ceil(h)]!;
  return below + (h - lo) * (above - below);
}

function previousMonth(month: string): string {
  return monthKey(addMonths(`${month}-01`, -1));
}

/**
 * Complete calendar-month returns from month-end closes (the last point of each
 * month). The first month has no previous month-end and the month containing
 * `asOf` is still running, so both are left out. A month whose previous
 * calendar month has no prices is also left out: it wouldn't be a one-month return.
 */
export function calendarMonthReturns(points: readonly PricePoint[], asOf: string): MonthlyReturn[] {
  assertIsoDate(asOf);
  const last = indexOnOrBefore(points, asOf);
  const monthEnds: PricePoint[] = [];
  for (let i = 0; i <= last; i++) {
    const p = points[i]!;
    const prev = monthEnds[monthEnds.length - 1];
    if (prev && monthKey(prev.date) === monthKey(p.date)) monthEnds[monthEnds.length - 1] = p;
    else monthEnds.push(p);
  }

  const running = monthKey(asOf);
  const out: MonthlyReturn[] = [];
  for (let i = 1; i < monthEnds.length; i++) {
    const prev = monthEnds[i - 1]!;
    const cur = monthEnds[i]!;
    const month = monthKey(cur.date);
    if (month === running || previousMonth(month) !== monthKey(prev.date)) continue;
    out.push({ month, return: simpleReturn(prev.close, cur.close) });
  }
  return out;
}

function annualisedVol(points: readonly PricePoint[], periodsPerYear: number): number {
  const logs: number[] = [];
  for (let i = 1; i < points.length; i++) logs.push(Math.log(points[i]!.close / points[i - 1]!.close));
  const mean = logs.reduce((s, x) => s + x, 0) / logs.length;
  const sumSq = logs.reduce((s, x) => s + (x - mean) ** 2, 0);
  return Math.sqrt(sumSq / (logs.length - 1)) * Math.sqrt(periodsPerYear);
}

/**
 * Largest peak-to-trough fall in points[start, end). A close equal to the
 * running peak becomes the new peak, so `peakDate` is the last high before the
 * fall; equal depths keep the earliest trough. No fall → depth 0 at `start`.
 */
function maxDrawdown(points: readonly PricePoint[], start = 0, end = points.length): Drawdown {
  let peak = points[start]!;
  let best: Drawdown = { depth: 0, peakDate: peak.date, troughDate: peak.date };
  for (let i = start; i < end; i++) {
    const p = points[i]!;
    if (p.close >= peak.close) {
      peak = p;
      continue;
    }
    const depth = p.close / peak.close - 1;
    if (depth < best.depth) best = { depth, peakDate: peak.date, troughDate: p.date };
  }
  return best;
}

/** Earliest month with the lowest return, or null for no months. */
function worstMonth(months: readonly MonthlyReturn[]): MonthlyReturn | null {
  let worst: MonthlyReturn | null = null;
  for (const m of months) if (worst === null || m.return < worst.return) worst = m;
  return worst;
}

/** Windows of `windowSessions + 1` consecutive points, step 1; a fall counts when its depth ≤ −threshold. */
function rollingFalls(
  points: readonly PricePoint[],
  windowSessions: number,
  threshold: number,
): RiskHistory["rollingFalls"] {
  if (!Number.isInteger(windowSessions) || windowSessions < 1) {
    throw new Error(`rollingWindowSessions must be a positive integer, got ${windowSessions}`);
  }
  const size = windowSessions + 1;
  let windows = 0;
  let withFall = 0;
  for (let s = 0; s + size <= points.length; s++) {
    windows++;
    if (maxDrawdown(points, s, s + size).depth <= -threshold) withFall++;
  }
  return { windows, withFall, share: windows === 0 ? 0 : withFall / windows };
}

/**
 * Risk stats over the trailing `cfg.historyYears` up to the last price on or
 * before `asOf` (or all of it when history is shorter; `from` and `sessions`
 * then show how much was used). The month of the last price is treated as
 * incomplete, so a feed that stopped mid-month can't pass off a partial month
 * as a full one. Needs at least 3 prices: a sample stdev needs 2 daily returns.
 */
export function riskHistory(series: Series, asOf: string, cfg: RiskConfig = RISK): RiskHistory {
  assertIsoDate(asOf);
  const endIdx = indexOnOrBefore(series.points, asOf);
  if (endIdx < 0) throw new Error(`${series.id}: no prices on or before ${asOf}`);
  const end = series.points[endIdx]!;
  const baseIdx = indexOnOrBefore(series.points, addMonths(end.date, -12 * cfg.historyYears));
  const points = series.points.slice(Math.max(baseIdx, 0), endIdx + 1);
  if (points.length < 3) {
    throw new Error(
      `${series.id}: risk history needs at least 3 prices on or before ${asOf} (2 daily returns), got ${points.length}`,
    );
  }
  assertValidSeries({ id: series.id, points });

  const months = calendarMonthReturns(points, end.date);
  return {
    from: points[0]!.date,
    to: end.date,
    sessions: points.length - 1,
    annualisedVol: annualisedVol(points, cfg.tradingDaysPerYear),
    maxDrawdown: maxDrawdown(points),
    worstMonth: worstMonth(months),
    typicalBadMonth:
      months.length > 0 ? percentile(months.map((m) => m.return), cfg.typicalBadMonthPercentile) : null,
    monthsUsed: months.length,
    rollingFalls: rollingFalls(points, cfg.rollingWindowSessions, cfg.rollingFallThreshold),
  };
}
