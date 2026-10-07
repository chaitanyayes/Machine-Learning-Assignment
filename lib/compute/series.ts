// A price series is an ascending list of daily closes with unique dates.
// Every compute function takes a series and an `asOf` date and must only look
// at points on or before `asOf`, so no screen can see "future" prices.

export type PricePoint = { date: string; close: number };
export type Series = { id: string; points: PricePoint[] };

/** Points on or before `asOf`. */
export function sliceToAsOf(series: Series, asOf: string): Series {
  return { id: series.id, points: series.points.filter((p) => p.date <= asOf) };
}

/** Index of the last point with date ≤ `date`, or -1 if none. Binary search. */
export function indexOnOrBefore(points: readonly PricePoint[], date: string): number {
  let lo = 0;
  let hi = points.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.date <= date) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Index of the point exactly on `date`, or -1. */
export function indexOf(points: readonly PricePoint[], date: string): number {
  const i = indexOnOrBefore(points, date);
  return i >= 0 && points[i]!.date === date ? i : -1;
}

export function closeOnOrBefore(points: readonly PricePoint[], date: string): PricePoint | null {
  const i = indexOnOrBefore(points, date);
  return i >= 0 ? points[i]! : null;
}

/** Simple return from `from` close to `to` close, as a fraction. */
export function simpleReturn(from: number, to: number): number {
  return to / from - 1;
}

/** Throws if dates are not strictly ascending or closes are not positive finite numbers. */
export function assertValidSeries(series: Series): void {
  for (let i = 0; i < series.points.length; i++) {
    const p = series.points[i]!;
    if (!(p.close > 0) || !Number.isFinite(p.close)) {
      throw new Error(`${series.id}: bad close ${p.close} on ${p.date}`);
    }
    if (i > 0 && series.points[i - 1]!.date >= p.date) {
      throw new Error(`${series.id}: dates not strictly ascending at ${p.date}`);
    }
  }
}
