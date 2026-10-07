import { describe, it, expect } from "vitest";
import {
  actionsInWindow,
  adjustmentFactor,
  adjustSeries,
  windowMoveWithActions,
} from "@/lib/compute/corporateActions";
import type { PricePoint, Series } from "@/lib/compute/series";
import type { CorporateAction } from "@/lib/data/schemas";

const series = (points: PricePoint[]): Series => ({ id: "TEST", points });

const bonus = (exDate: string, after = 2, before = 1, id = "A1"): CorporateAction => ({
  id,
  companyId: "test-co",
  type: "bonus",
  exDate,
  details: "Bonus issue.",
  shareMultiplier: { after, before },
});

const split = (exDate: string, after = 5, before = 1, id = "A2"): CorporateAction => ({
  id,
  companyId: "test-co",
  type: "split",
  exDate,
  details: "Stock split.",
  shareMultiplier: { after, before },
});

const dividend = (exDate: string, id = "A3"): CorporateAction => ({
  id,
  companyId: "test-co",
  type: "dividend",
  exDate,
  details: "Dividend.",
  shareMultiplier: null,
});

const closes = (s: Series): number[] => s.points.map((p) => p.close);

// S10-shaped week: base Fri 17 Jul, 1:1 bonus ex 22 Jul halves the quote.
// The 27 Jul point is after asOf (24 Jul) and must never be read.
const BONUS_WEEK = series([
  { date: "2026-07-16", close: 990 },
  { date: "2026-07-17", close: 1000 },
  { date: "2026-07-20", close: 1002 },
  { date: "2026-07-21", close: 1004 },
  { date: "2026-07-22", close: 503 },
  { date: "2026-07-23", close: 504 },
  { date: "2026-07-24", close: 505 },
  { date: "2026-07-27", close: 9999 },
]);

describe("adjustmentFactor", () => {
  it("is after / before for bonus and split", () => {
    expect(adjustmentFactor(bonus("2026-07-22"))).toBe(2); // 1:1 bonus → 2 / 1
    expect(adjustmentFactor(bonus("2026-07-22", 3, 2))).toBe(1.5); // 1:2 bonus → 3 / 2
    expect(adjustmentFactor(split("2024-09-13"))).toBe(5); // 5-for-1 split → 5 / 1
  });

  it("is 1 for a dividend", () => {
    expect(adjustmentFactor(dividend("2026-06-19"))).toBe(1);
  });

  it("throws for a bonus or split without a share multiplier", () => {
    expect(() => adjustmentFactor({ ...bonus("2026-07-22"), shareMultiplier: null })).toThrow(/shareMultiplier/);
    expect(() => adjustmentFactor({ ...split("2026-07-22"), shareMultiplier: null })).toThrow(/shareMultiplier/);
  });
});

describe("adjustSeries", () => {
  it("halves closes before a 1:1 bonus ex-date and leaves the rest", () => {
    const adj = adjustSeries(BONUS_WEEK, [bonus("2026-07-22")]);
    // Before 22 Jul ÷ 2: 990→495, 1000→500, 1002→501, 1004→502. On/after: unchanged.
    expect(closes(adj)).toEqual([495, 500, 501, 502, 503, 504, 505, 9999]);
    expect(adj.points.map((p) => p.date)).toEqual(BONUS_WEEK.points.map((p) => p.date));
  });

  it("divides by 5 before a 5-for-1 split", () => {
    const s = series([
      { date: "2024-09-11", close: 2500 },
      { date: "2024-09-12", close: 2510 },
      { date: "2024-09-13", close: 503 },
      { date: "2024-09-16", close: 505 },
    ]);
    // 2500 / 5 = 500, 2510 / 5 = 502; ex-date and later unchanged.
    expect(closes(adjustSeries(s, [split("2024-09-13")]))).toEqual([500, 502, 503, 505]);
  });

  it("multiplies factors when several actions apply", () => {
    const s = series([
      { date: "2026-01-01", close: 1000 }, // before both: ÷ (2 × 5) = 100
      { date: "2026-02-02", close: 510 }, // bonus applied, split not yet: ÷ 5 = 102
      { date: "2026-03-02", close: 104 }, // on split ex-date: unchanged
      { date: "2026-03-03", close: 105 },
    ]);
    const adj = adjustSeries(s, [bonus("2026-02-02"), split("2026-03-02")]);
    expect(closes(adj)).toEqual([100, 102, 104, 105]);
    // Order of the action list does not matter.
    expect(closes(adjustSeries(s, [split("2026-03-02"), bonus("2026-02-02")]))).toEqual([100, 102, 104, 105]);
  });

  it("compounds two actions on the same ex-date", () => {
    const s = series([
      { date: "2026-03-02", close: 1000 },
      { date: "2026-03-03", close: 100 },
    ]);
    // 1000 ÷ (2 × 5) = 100.
    expect(closes(adjustSeries(s, [bonus("2026-03-03"), split("2026-03-03")]))).toEqual([100, 100]);
  });

  it("leaves prices unchanged for a dividend", () => {
    const adj = adjustSeries(BONUS_WEEK, [dividend("2026-07-22")]);
    expect(closes(adj)).toEqual(closes(BONUS_WEEK));
  });

  it("ignores actions before the first point", () => {
    // Every point is on/after the ex-date, so nothing is divided.
    expect(closes(adjustSeries(BONUS_WEEK, [bonus("2020-01-01")]))).toEqual(closes(BONUS_WEEK));
  });

  it("returns a new series with an :adj id and does not mutate the input", () => {
    const before = structuredClone(BONUS_WEEK);
    const adj = adjustSeries(BONUS_WEEK, [bonus("2026-07-22")]);
    expect(adj.id).toBe("TEST:adj");
    expect(adj).not.toBe(BONUS_WEEK);
    expect(adj.points).not.toBe(BONUS_WEEK.points);
    expect(BONUS_WEEK).toEqual(before);
    // Even with no actions, the result is a fresh copy.
    const copy = adjustSeries(BONUS_WEEK, []);
    expect(copy.points).not.toBe(BONUS_WEEK.points);
    expect(copy.points[0]).not.toBe(BONUS_WEEK.points[0]);
    expect(closes(copy)).toEqual(closes(BONUS_WEEK));
  });

  it("handles an empty series", () => {
    expect(adjustSeries({ id: "EMPTY", points: [] }, [bonus("2026-07-22")])).toEqual({ id: "EMPTY:adj", points: [] });
  });
});

describe("actionsInWindow", () => {
  const window = { from: "2026-07-17", to: "2026-07-24" };

  it("excludes an ex-date on `from` and includes one on `to`", () => {
    const onFrom = bonus("2026-07-17", 2, 1, "A1");
    const inside = dividend("2026-07-20", "A2");
    const onTo = split("2026-07-24", 5, 1, "A3");
    const after = bonus("2026-07-27", 2, 1, "A4");
    const before = bonus("2026-07-16", 2, 1, "A5");
    const got = actionsInWindow([onFrom, inside, onTo, after, before], window);
    expect(got.map((a) => a.id)).toEqual(["A2", "A3"]);
  });

  it("returns an empty list for no actions", () => {
    expect(actionsInWindow([], window)).toEqual([]);
  });
});

describe("windowMoveWithActions", () => {
  it("1:1 bonus: raw ≈ −50%, adjusted ≈ +1%", () => {
    const m = windowMoveWithActions(BONUS_WEEK, [bonus("2026-07-22")], "2026-07-24", 5);
    // to = 24 Jul (505); from = 5 points earlier = 17 Jul (1000).
    // raw = 505 / 1000 − 1 = −0.495. adjusted = 505 / (1000 / 2) − 1 = 0.01.
    expect(m).not.toBeNull();
    expect(m!.from).toBe("2026-07-17");
    expect(m!.to).toBe("2026-07-24");
    expect(m!.raw).toBeCloseTo(-0.495, 12);
    expect(m!.adjusted).toBeCloseTo(0.01, 12);
    expect(m!.actionsInWindow.map((a) => a.id)).toEqual(["A1"]);
  });

  it("5-for-1 split inside the window", () => {
    const s = series([
      { date: "2024-09-11", close: 2500 },
      { date: "2024-09-12", close: 2510 },
      { date: "2024-09-13", close: 503 },
      { date: "2024-09-16", close: 490 },
    ]);
    const m = windowMoveWithActions(s, [split("2024-09-13")], "2024-09-16", 3)!;
    // from 11 Sep (2500), to 16 Sep (490).
    // raw = 490 / 2500 − 1 = −0.804. adjusted = 490 / 500 − 1 = −0.02 (a real 2% fall).
    expect(m.raw).toBeCloseTo(-0.804, 12);
    expect(m.adjusted).toBeCloseTo(-0.02, 12);
  });

  it("two actions in one window compound", () => {
    const s = series([
      { date: "2026-03-02", close: 1000 },
      { date: "2026-03-03", close: 505 }, // 1:1 bonus ex
      { date: "2026-03-04", close: 101 }, // 5-for-1 split ex
    ]);
    const m = windowMoveWithActions(s, [bonus("2026-03-03"), split("2026-03-04")], "2026-03-04", 2)!;
    // raw = 101 / 1000 − 1 = −0.899. adjusted = 101 / (1000 / 10) − 1 = 0.01.
    expect(m.raw).toBeCloseTo(-0.899, 12);
    expect(m.adjusted).toBeCloseTo(0.01, 12);
    expect(m.actionsInWindow).toHaveLength(2);
  });

  it("a dividend in the window is listed but leaves the adjusted move equal to the raw one", () => {
    const m = windowMoveWithActions(BONUS_WEEK, [dividend("2026-07-22")], "2026-07-24", 5)!;
    expect(m.adjusted).toBe(m.raw);
    expect(m.actionsInWindow.map((a) => a.type)).toEqual(["dividend"]);
  });

  it("ex-date exactly on `from` is excluded and does not change the move", () => {
    // Window 22 Jul → 24 Jul (2 sessions). Both ends are on/after the ex-date.
    // raw = adjusted = 505 / 503 − 1 ≈ 0.003976.
    const m = windowMoveWithActions(BONUS_WEEK, [bonus("2026-07-22")], "2026-07-24", 2)!;
    expect(m.from).toBe("2026-07-22");
    expect(m.actionsInWindow).toEqual([]);
    expect(m.raw).toBeCloseTo(505 / 503 - 1, 12);
    expect(m.adjusted).toBe(m.raw);
  });

  it("ex-date exactly on `to` is included and adjusts the move", () => {
    // asOf 22 Jul, 2 sessions: from 20 Jul (1002), to 22 Jul (503).
    // raw = 503 / 1002 − 1 ≈ −0.498; adjusted = 503 / 501 − 1 ≈ +0.003992.
    const m = windowMoveWithActions(BONUS_WEEK, [bonus("2026-07-22")], "2026-07-22", 2)!;
    expect(m.to).toBe("2026-07-22");
    expect(m.actionsInWindow.map((a) => a.id)).toEqual(["A1"]);
    expect(m.raw).toBeCloseTo(503 / 1002 - 1, 12);
    expect(m.adjusted).toBeCloseTo(503 / 501 - 1, 12);
  });

  it("an action after asOf is not applied and not listed", () => {
    // asOf 21 Jul is before the 22 Jul ex-date: from 17 Jul (1000), to 21 Jul (1004).
    // raw = adjusted = 1004 / 1000 − 1 = 0.004.
    const m = windowMoveWithActions(BONUS_WEEK, [bonus("2026-07-22")], "2026-07-21", 2)!;
    expect(m.raw).toBeCloseTo(0.004, 12);
    expect(m.adjusted).toBe(m.raw);
    expect(m.actionsInWindow).toEqual([]);
  });

  it("an action before the window leaves both moves equal", () => {
    const m = windowMoveWithActions(BONUS_WEEK, [bonus("2026-07-01")], "2026-07-24", 5)!;
    expect(m.adjusted).toBe(m.raw);
    expect(m.actionsInWindow).toEqual([]);
  });

  it("ignores points after asOf and anchors a weekend asOf on the last session", () => {
    // asOf Sun 26 Jul → to = Fri 24 Jul; the 27 Jul close of 9999 is never read.
    const m = windowMoveWithActions(BONUS_WEEK, [bonus("2026-07-22")], "2026-07-26", 5)!;
    expect(m.to).toBe("2026-07-24");
    expect(m.raw).toBeCloseTo(-0.495, 12);
    expect(m.adjusted).toBeCloseTo(0.01, 12);
  });

  it("with no actions, adjusted equals raw", () => {
    const m = windowMoveWithActions(BONUS_WEEK, [], "2026-07-24", 5)!;
    expect(m.adjusted).toBe(m.raw);
    expect(m.actionsInWindow).toEqual([]);
  });

  it("returns null with not enough history", () => {
    // Points up to 24 Jul: 7 (16 Jul … 24 Jul). 6 sessions fits (from = 16 Jul), 7 does not.
    expect(windowMoveWithActions(BONUS_WEEK, [], "2026-07-24", 6)).not.toBeNull();
    expect(windowMoveWithActions(BONUS_WEEK, [], "2026-07-24", 7)).toBeNull();
  });

  it("returns null when asOf is before the data or the series is empty", () => {
    expect(windowMoveWithActions(BONUS_WEEK, [], "2026-07-01", 1)).toBeNull();
    expect(windowMoveWithActions({ id: "EMPTY", points: [] }, [], "2026-07-24", 1)).toBeNull();
  });

  it("uses the last point when asOf is after the data", () => {
    // asOf 2027: to = 27 Jul (9999), from = 24 Jul (505). raw = adjusted = 9999 / 505 − 1.
    const m = windowMoveWithActions(BONUS_WEEK, [bonus("2026-07-22")], "2027-01-01", 1)!;
    expect(m.to).toBe("2026-07-27");
    expect(m.raw).toBeCloseTo(9999 / 505 - 1, 12);
    expect(m.adjusted).toBe(m.raw);
  });

  it("rejects a non-positive or fractional session count", () => {
    expect(() => windowMoveWithActions(BONUS_WEEK, [], "2026-07-24", 0)).toThrow(RangeError);
    expect(() => windowMoveWithActions(BONUS_WEEK, [], "2026-07-24", 2.5)).toThrow(RangeError);
  });

  it("does not mutate its inputs", () => {
    const before = structuredClone(BONUS_WEEK);
    const actions = [bonus("2026-07-22")];
    windowMoveWithActions(BONUS_WEEK, actions, "2026-07-24", 5);
    expect(BONUS_WEEK).toEqual(before);
    expect(actions).toHaveLength(1);
  });
});
