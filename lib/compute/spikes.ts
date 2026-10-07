import { SPIKES } from "@/lib/config";
import { weekKey } from "./dates";
import { indexOf, indexOnOrBefore, simpleReturn, type PricePoint, type Series } from "./series";

// Past "spike" weeks (a weekly rise of SPIKES.weeklyRiseThreshold or more) and
// what the price did over the following sessions. Inputs are adjusted series.

export type WeeklyClose = {
  /** weekKey(date): the Monday of the Monday–Friday week. */
  week: string;
  /** Date of the week's last point (a Thursday in a week whose Friday is a holiday). */
  date: string;
  close: number;
};

/** The last point of each Monday–Friday week, ascending. `points` must be ascending. */
export function weeklyCloses(points: readonly PricePoint[]): WeeklyClose[] {
  const out: WeeklyClose[] = [];
  for (const p of points) {
    const week = weekKey(p.date);
    const entry = { week, date: p.date, close: p.close };
    if (out.length > 0 && out[out.length - 1]!.week === week) out[out.length - 1] = entry;
    else out.push(entry);
  }
  return out;
}

export type Spike = {
  /** Date of the spike week's last point. */
  weekEnd: string;
  /** This week's close / previous week's close − 1. */
  weekReturn: number;
  /** Close `followSessions` points after weekEnd / weekEnd close − 1; null when that point is after asOf. */
  followThrough: number | null;
  followThroughEnd: string | null;
};

export type SpikeHistory = {
  /** Every spike up to asOf (outside the excluded window), ascending. */
  spikes: Spike[];
  /** Spikes with a follow-through. */
  counted: number;
  /** Counted spikes whose follow-through was above zero. */
  positive: number;
  /** Spikes listed but not counted because their follow-through runs past asOf. */
  excludedRecent: number;
};

type PriorSpikesOptions = {
  /** Spike weeks ending after this date belong to the current move and are left out. */
  excludeFrom?: string;
  threshold?: number;
  followSessions?: number;
};

/**
 * Weeks before asOf whose close rose at least `threshold` over the previous
 * week's close, each with the return over the next `followSessions` sessions.
 * The first week in the data has no previous week and is never a spike.
 */
export function priorSpikes(series: Series, asOf: string, opts: PriorSpikesOptions = {}): SpikeHistory {
  const threshold = opts.threshold ?? SPIKES.weeklyRiseThreshold;
  const followSessions = opts.followSessions ?? SPIKES.followThroughSessions;
  if (!Number.isInteger(followSessions) || followSessions < 1) {
    throw new RangeError(`followSessions must be a positive integer, got ${followSessions}`);
  }

  const points = series.points.slice(0, indexOnOrBefore(series.points, asOf) + 1);
  const weeks = weeklyCloses(points);
  const spikes: Spike[] = [];
  let counted = 0;
  let positive = 0;
  let excludedRecent = 0;

  for (let w = 1; w < weeks.length; w++) {
    const week = weeks[w]!;
    const weekReturn = simpleReturn(weeks[w - 1]!.close, week.close);
    if (weekReturn < threshold) continue;
    if (opts.excludeFrom !== undefined && week.date > opts.excludeFrom) continue;

    const later = points[indexOf(points, week.date) + followSessions];
    if (later) {
      const followThrough = simpleReturn(week.close, later.close);
      spikes.push({ weekEnd: week.date, weekReturn, followThrough, followThroughEnd: later.date });
      counted++;
      if (followThrough > 0) positive++;
    } else {
      spikes.push({ weekEnd: week.date, weekReturn, followThrough: null, followThroughEnd: null });
      excludedRecent++;
    }
  }

  return { spikes, counted, positive, excludedRecent };
}
