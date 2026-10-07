import { DRAWDOWNS } from "@/lib/config";
import { simpleReturn, type PricePoint, type Series } from "./series";

// Falls of DRAWDOWNS.threshold or more from a running peak, and how long each
// took to win back that peak. Inputs are adjusted series.

export type DrawdownEpisode = {
  peakDate: string;
  peakClose: number;
  troughDate: string;
  troughClose: number;
  /** troughClose / peakClose − 1, so negative. */
  depth: number;
  /** First date after the trough with close ≥ peakClose; null = not recovered by asOf. */
  recoveredDate: string | null;
  sessionsTroughToRecovery: number | null;
  sessionsPeakToRecovery: number | null;
};

type DrawdownOptions = {
  threshold?: number;
  /** First date to scan; the running peak starts at the first point on or after it. */
  from?: string;
};

function episode(points: readonly PricePoint[], peak: number, trough: number, recovered: number | null): DrawdownEpisode {
  const p = points[peak]!;
  const t = points[trough]!;
  return {
    peakDate: p.date,
    peakClose: p.close,
    troughDate: t.date,
    troughClose: t.close,
    depth: simpleReturn(p.close, t.close),
    recoveredDate: recovered === null ? null : points[recovered]!.date,
    sessionsTroughToRecovery: recovered === null ? null : recovered - trough,
    sessionsPeakToRecovery: recovered === null ? null : recovered - peak,
  };
}

/**
 * Drawdown episodes in chronological order. An episode starts when a close is
 * at or below runningPeak × (1 − threshold) and ends at the first close back at
 * or above that peak, where the running peak restarts. Ties keep the fall as
 * short as possible: the peak is the latest close at the running high, the
 * trough the first close at the low.
 */
export function drawdownEpisodes(series: Series, asOf: string, opts: DrawdownOptions = {}): DrawdownEpisode[] {
  const threshold = opts.threshold ?? DRAWDOWNS.threshold;
  if (!(threshold > 0 && threshold < 1)) {
    throw new RangeError(`threshold must be between 0 and 1, got ${threshold}`);
  }
  const from = opts.from;
  const points = series.points.filter((p) => p.date <= asOf && (from === undefined || p.date >= from));

  const out: DrawdownEpisode[] = [];
  let peak = 0;
  let trough: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const close = points[i]!.close;
    const peakClose = points[peak]!.close;
    if (trough === null) {
      if (close >= peakClose) peak = i;
      else if (close <= peakClose * (1 - threshold)) trough = i;
    } else if (close >= peakClose) {
      out.push(episode(points, peak, trough, i));
      peak = i;
      trough = null;
    } else if (close < points[trough]!.close) {
      trough = i;
    }
  }
  if (trough !== null) out.push(episode(points, peak, trough, null));
  return out;
}
