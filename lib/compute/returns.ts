import { PERIODS, type PeriodKey } from "@/lib/config";
import { addDays, addMonths } from "./dates";
import { closeOnOrBefore, indexOnOrBefore, simpleReturn, type PricePoint, type Series } from "./series";

// Simple returns as fractions (0.07 = 7%), unrounded. Every function anchors on
// the last point on or before `asOf`, so later points are never read.

export type PeriodReturns = Record<PeriodKey, number | null>;

type Period = (typeof PERIODS)[number];

/** Base point for one look-back period, or null when history is too short. */
function periodBase(points: readonly PricePoint[], endIndex: number, period: Period): PricePoint | null {
  if ("sessions" in period) {
    const i = endIndex - period.sessions;
    return i >= 0 ? points[i]! : null;
  }
  const endDate = points[endIndex]!.date;
  const target = "days" in period ? addDays(endDate, -period.days) : addMonths(endDate, -period.months);
  return closeOnOrBefore(points, target);
}

/**
 * Returns for every period in `PERIODS`. "1D" compares with the previous point;
 * calendar periods compare with the last point on or before the same date one
 * week / N months before the end point (brokerage convention).
 */
export function periodReturns(series: Series, asOf: string): PeriodReturns {
  const points = series.points;
  const endIndex = indexOnOrBefore(points, asOf);
  const out = {} as PeriodReturns;
  for (const period of PERIODS) {
    const base = endIndex >= 0 ? periodBase(points, endIndex, period) : null;
    out[period.key] = base ? simpleReturn(base.close, points[endIndex]!.close) : null;
  }
  return out;
}

export type WindowReturn = {
  from: string;
  to: string;
  fromClose: number;
  toClose: number;
  sessions: number;
  return: number;
};

/**
 * Return over the last `sessions` points ending on or before `asOf`: `to` is
 * that last point, `from` is the point `sessions` positions earlier. Null when
 * the series has too few points.
 */
export function windowReturn(series: Series, asOf: string, sessions: number): WindowReturn | null {
  if (!Number.isInteger(sessions) || sessions < 1) {
    throw new RangeError(`sessions must be a positive integer, got ${sessions}`);
  }
  const toIndex = indexOnOrBefore(series.points, asOf);
  const fromIndex = toIndex - sessions;
  if (toIndex < 0 || fromIndex < 0) return null;
  const from = series.points[fromIndex]!;
  const to = series.points[toIndex]!;
  return {
    from: from.date,
    to: to.date,
    fromClose: from.close,
    toClose: to.close,
    sessions,
    return: simpleReturn(from.close, to.close),
  };
}
