import type { CorporateAction } from "@/lib/data/schemas";
import { indexOnOrBefore, simpleReturn, type Series } from "./series";

// Backward adjustment for bonus issues and splits: closes before an ex-date are
// divided by the share multiplier, so a 1:1 bonus that halves the quoted price
// does not read as a 50% crash. Closes on or after the ex-date stay as quoted.

/**
 * Shares after ÷ shares before for a bonus or split (1:1 bonus → 2, 5-for-1
 * split → 5). Dividends return 1: they are not price-adjusted in this prototype,
 * because they don't change the share count.
 */
export function adjustmentFactor(action: CorporateAction): number {
  if (action.type === "dividend") return 1;
  const m = action.shareMultiplier;
  if (!m) throw new Error(`${action.id}: ${action.type} has no shareMultiplier`);
  return m.after / m.before;
}

/**
 * New series (id + ":adj") with every close dated before an action's ex-date
 * divided by its factor; factors multiply when several actions apply. Does not
 * mutate `raw` and does not filter by company, so pass only that company's
 * actions. Pass a series cut at asOf so later points are never adjusted or read.
 */
export function adjustSeries(raw: Series, actions: readonly CorporateAction[]): Series {
  const adjusting = actions
    .map((a) => ({ exDate: a.exDate, factor: adjustmentFactor(a) }))
    .filter((a) => a.factor !== 1);
  const points = raw.points.map((p) => {
    let factor = 1;
    for (const a of adjusting) if (p.date < a.exDate) factor *= a.factor;
    return { date: p.date, close: p.close / factor };
  });
  return { id: `${raw.id}:adj`, points };
}

/** Actions of any type with from < exDate ≤ to, in input order. */
export function actionsInWindow(
  actions: readonly CorporateAction[],
  window: { from: string; to: string },
): CorporateAction[] {
  return actions.filter((a) => a.exDate > window.from && a.exDate <= window.to);
}

export type CorporateActionMove = { action: CorporateAction; rawReturn: number; adjustedReturn: number };

export type WindowMoveWithActions = {
  /** Return on quoted (raw) closes. */
  raw: number;
  /** Return on bonus/split-adjusted closes. */
  adjusted: number;
  from: string;
  to: string;
  actionsInWindow: CorporateAction[];
};

/**
 * Raw and adjusted simple returns over the last `sessions` points ending on or
 * before `asOf` (`to` = that last point, `from` = `sessions` points earlier).
 * Null when the series has too few points. Only actions with exDate ≤ asOf are
 * applied, so nothing after asOf is read; later actions would scale both ends
 * of the window equally and leave the return unchanged anyway.
 */
export function windowMoveWithActions(
  raw: Series,
  actions: readonly CorporateAction[],
  asOf: string,
  sessions: number,
): WindowMoveWithActions | null {
  if (!Number.isInteger(sessions) || sessions < 1) {
    throw new RangeError(`sessions must be a positive integer, got ${sessions}`);
  }
  const toIndex = indexOnOrBefore(raw.points, asOf);
  const fromIndex = toIndex - sessions;
  if (toIndex < 0 || fromIndex < 0) return null;

  const cut: Series = { id: raw.id, points: raw.points.slice(0, toIndex + 1) };
  const adjusted = adjustSeries(cut, actions.filter((a) => a.exDate <= asOf));
  const from = cut.points[fromIndex]!;
  const to = cut.points[toIndex]!;
  return {
    raw: simpleReturn(from.close, to.close),
    adjusted: simpleReturn(adjusted.points[fromIndex]!.close, adjusted.points[toIndex]!.close),
    from: from.date,
    to: to.date,
    actionsInWindow: actionsInWindow(actions, { from: from.date, to: to.date }),
  };
}
