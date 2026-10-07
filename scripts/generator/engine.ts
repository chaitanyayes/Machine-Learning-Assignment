import { tradingDays } from "@/lib/compute/calendar";
import { createNormal } from "./prng";

// Builds one price path: a seeded random walk (optionally riding on a parent
// index's moves) pinned to anchor prices with Brownian bridges. Between two
// anchors the walk keeps its random shape but is tilted so it lands exactly
// on the next anchor; before the first and after the last anchor it is only
// shifted. This is how scenario windows hit their targets exactly while the
// rest of the history stays noisy and plausible.

export type Anchor = {
  date: string;
  /** Price at `date` divided by the price at the spec's refDate. */
  rel: number;
};

export type PathSpec = {
  id: string;
  start: string;
  end: string;
  refDate: string;
  refPrice: number;
  /** Annualised volatility of the series' own (idiosyncratic) daily moves. */
  annualVol: number;
  parent?: { path: GeneratedPath; beta: number };
  anchors: Anchor[];
  seed: string;
};

export type GeneratedPath = {
  id: string;
  dates: string[];
  /** Unrounded prices. */
  prices: number[];
  /** Daily log returns keyed by date (the first date has none). */
  logReturns: Map<string, number>;
};

export function generatePath(spec: PathSpec): GeneratedPath {
  const dates = tradingDays(spec.start, spec.end);
  if (dates.length < 2) throw new Error(`${spec.id}: fewer than 2 trading days`);
  const normal = createNormal(spec.seed);
  const dailyVol = spec.annualVol / Math.sqrt(252);

  // 1. Raw log path.
  const raw = new Array<number>(dates.length).fill(0);
  for (let k = 1; k < dates.length; k++) {
    let r = dailyVol * normal();
    if (spec.parent) {
      const pr = spec.parent.path.logReturns.get(dates[k]!);
      if (pr === undefined) throw new Error(`${spec.id}: parent has no return on ${dates[k]}`);
      r += spec.parent.beta * pr;
    }
    raw[k] = raw[k - 1]! + r;
  }

  // 2. Anchors as (index, target log level relative to refDate).
  const indexOfDate = new Map(dates.map((d, i) => [d, i]));
  const refIdx = indexOfDate.get(spec.refDate);
  if (refIdx === undefined) throw new Error(`${spec.id}: refDate ${spec.refDate} is not a trading day in range`);
  const anchors = [...spec.anchors, { date: spec.refDate, rel: 1 }]
    .map((a) => {
      const i = indexOfDate.get(a.date);
      if (i === undefined) throw new Error(`${spec.id}: anchor ${a.date} is not a trading day in range`);
      if (!(a.rel > 0)) throw new Error(`${spec.id}: anchor ${a.date} has non-positive rel`);
      return { i, level: Math.log(a.rel) };
    })
    .sort((x, y) => x.i - y.i);
  for (let j = 1; j < anchors.length; j++) {
    if (anchors[j]!.i === anchors[j - 1]!.i) {
      if (Math.abs(anchors[j]!.level - anchors[j - 1]!.level) > 1e-12) {
        throw new Error(`${spec.id}: two different anchors on ${dates[anchors[j]!.i]}`);
      }
    }
  }

  // 3. Bridge.
  const path = new Array<number>(dates.length).fill(0);
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  for (let k = 0; k <= first.i; k++) path[k] = first.level + (raw[k]! - raw[first.i]!);
  for (let j = 1; j < anchors.length; j++) {
    const a = anchors[j - 1]!;
    const b = anchors[j]!;
    if (b.i === a.i) continue;
    const gap = b.level - a.level - (raw[b.i]! - raw[a.i]!);
    for (let k = a.i; k <= b.i; k++) {
      path[k] = a.level + (raw[k]! - raw[a.i]!) + ((k - a.i) / (b.i - a.i)) * gap;
    }
  }
  for (let k = last.i; k < dates.length; k++) path[k] = last.level + (raw[k]! - raw[last.i]!);

  const prices = path.map((l) => spec.refPrice * Math.exp(l));
  const logReturns = new Map<string, number>();
  for (let k = 1; k < dates.length; k++) logReturns.set(dates[k]!, path[k]! - path[k - 1]!);
  return { id: spec.id, dates, prices, logReturns };
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
