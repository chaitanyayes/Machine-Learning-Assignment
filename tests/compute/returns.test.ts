import { describe, it, expect } from "vitest";
import { PERIODS } from "@/lib/config";
import { periodReturns, windowReturn } from "@/lib/compute/returns";
import type { PricePoint, Series } from "@/lib/compute/series";

const series = (points: PricePoint[]): Series => ({ id: "TEST", points });

// End point 24 Jul 2026 (Fri). Each base sits exactly where its period lands:
//   1D → previous point 23 Jul; 1W → 24 Jul − 7d = 17 Jul; 1M → 24 Jun;
//   6M → 24 Jan 2026 is a Saturday, so the last point on or before is 23 Jan;
//   1Y → 24 Jul 2025; 3Y → 24 Jul 2023.
// The 27 Jul point is after asOf and must never be used.
const FULL = series([
  { date: "2023-07-24", close: 50 },
  { date: "2025-07-24", close: 80 },
  { date: "2026-01-23", close: 90 },
  { date: "2026-01-26", close: 1000 }, // after the 6M target: must not be picked
  { date: "2026-06-24", close: 95 },
  { date: "2026-07-17", close: 98 },
  { date: "2026-07-23", close: 99 },
  { date: "2026-07-24", close: 100 },
  { date: "2026-07-27", close: 200 },
]);

describe("periodReturns", () => {
  it("returns one entry per configured period", () => {
    const r = periodReturns(FULL, "2026-07-24");
    expect(Object.keys(r).sort()).toEqual(PERIODS.map((p) => p.key).sort());
  });

  it("computes each period from the right base point", () => {
    const r = periodReturns(FULL, "2026-07-24");
    expect(r["1D"]).toBeCloseTo(100 / 99 - 1, 12); // 0.010101…
    expect(r["1W"]).toBeCloseTo(100 / 98 - 1, 12); // 0.020408…
    expect(r["1M"]).toBeCloseTo(100 / 95 - 1, 12); // 0.052631…
    expect(r["6M"]).toBeCloseTo(100 / 90 - 1, 12); // 0.111111…
    expect(r["1Y"]).toBeCloseTo(0.25, 12); // 100 / 80 − 1
    expect(r["3Y"]).toBeCloseTo(1, 12); // 100 / 50 − 1
  });

  it("anchors on the last point on or before asOf (weekend asOf)", () => {
    // asOf Sun 26 Jul → end is still Fri 24 Jul, and calendar bases move with
    // end.date, not asOf. Results match the Friday ones.
    expect(periodReturns(FULL, "2026-07-26")).toEqual(periodReturns(FULL, "2026-07-24"));
  });

  it("ignores points after asOf", () => {
    // asOf 24 Jul: the 27 Jul close of 200 would make 1D = 200/100 − 1 = 1.
    expect(periodReturns(FULL, "2026-07-24")["1D"]).not.toBeCloseTo(1);
    // asOf 27 Jul uses it: 1D = 200 / 100 − 1 = 1.
    expect(periodReturns(FULL, "2026-07-27")["1D"]).toBeCloseTo(1, 12);
  });

  it("picks the last point before a gap, not the next one after it", () => {
    // 1M target from 24 Jul is 24 Jun; only 22 Jun (94) and 25 Jun (96) exist → base 94.
    const s = series([
      { date: "2026-06-22", close: 94 },
      { date: "2026-06-25", close: 96 },
      { date: "2026-07-24", close: 100 },
    ]);
    expect(periodReturns(s, "2026-07-24")["1M"]).toBeCloseTo(100 / 94 - 1, 12);
  });

  it("clamps month arithmetic at month end", () => {
    // End 31 Mar 2026 → 1M target 28 Feb 2026 (Sat) → base 27 Feb (100). 121 / 100 − 1 = 0.21.
    const s = series([
      { date: "2026-02-27", close: 100 },
      { date: "2026-03-02", close: 110 },
      { date: "2026-03-31", close: 121 },
    ]);
    expect(periodReturns(s, "2026-03-31")["1M"]).toBeCloseTo(0.21, 12);
  });

  it("returns null for periods with too little history", () => {
    // Starts exactly on the 1Y target (24 Jul 2025): 1Y exists, 3Y does not.
    const s = series([
      { date: "2025-07-24", close: 80 },
      { date: "2026-07-23", close: 99 },
      { date: "2026-07-24", close: 100 },
    ]);
    const r = periodReturns(s, "2026-07-24");
    expect(r["1Y"]).toBeCloseTo(0.25, 12);
    expect(r["3Y"]).toBeNull();
    // A history starting one day after the 1Y target has no 1Y base.
    const short = series([
      { date: "2025-07-25", close: 80 },
      { date: "2026-07-24", close: 100 },
    ]);
    expect(periodReturns(short, "2026-07-24")["1Y"]).toBeNull();
  });

  it("returns null everywhere for a single point", () => {
    const r = periodReturns(series([{ date: "2026-07-24", close: 100 }]), "2026-07-24");
    for (const p of PERIODS) expect(r[p.key]).toBeNull();
  });

  it("returns null everywhere for an empty series or asOf before the data", () => {
    for (const r of [periodReturns(series([]), "2026-07-24"), periodReturns(FULL, "2023-07-23")]) {
      for (const p of PERIODS) expect(r[p.key]).toBeNull();
    }
  });

  it("handles falls", () => {
    // 1D: 90 / 100 − 1 = −0.1. 1W: 17 Jul is the base (120) → 90 / 120 − 1 = −0.25.
    const s = series([
      { date: "2026-07-17", close: 120 },
      { date: "2026-07-23", close: 100 },
      { date: "2026-07-24", close: 90 },
    ]);
    const r = periodReturns(s, "2026-07-24");
    expect(r["1D"]).toBeCloseTo(-0.1, 12);
    expect(r["1W"]).toBeCloseTo(-0.25, 12);
  });

  it("returns 0, not null, for a flat period", () => {
    const s = series([
      { date: "2026-07-23", close: 100 },
      { date: "2026-07-24", close: 100 },
    ]);
    expect(periodReturns(s, "2026-07-24")["1D"]).toBe(0);
  });
});

// Five points on/before asOf (index 0–4) plus one after it.
const WIN = series([
  { date: "2026-07-17", close: 100 }, // 0
  { date: "2026-07-20", close: 102 }, // 1
  { date: "2026-07-21", close: 101 }, // 2
  { date: "2026-07-22", close: 105 }, // 3
  { date: "2026-07-23", close: 110 }, // 4
  { date: "2026-07-24", close: 120 }, // 5, after asOf in most tests
]);

describe("windowReturn", () => {
  it("counts sessions as positions in the series", () => {
    // to = index 4 (110), from = index 4 − 3 = 1 (102). 110 / 102 − 1 = 0.078431…
    expect(windowReturn(WIN, "2026-07-23", 3)).toEqual({
      from: "2026-07-20",
      to: "2026-07-23",
      fromClose: 102,
      toClose: 110,
      sessions: 3,
      return: 110 / 102 - 1,
    });
  });

  it("uses the earliest point when the window exactly fits", () => {
    // to = index 4 (110), from = index 0 (100). 110 / 100 − 1 = 0.1.
    const w = windowReturn(WIN, "2026-07-23", 4);
    expect(w?.from).toBe("2026-07-17");
    expect(w?.return).toBeCloseTo(0.1, 12);
  });

  it("returns null when there are not enough points", () => {
    // Only 5 points on/before 23 Jul: a 5-session window needs 6.
    expect(windowReturn(WIN, "2026-07-23", 5)).toBeNull();
  });

  it("ignores points after asOf", () => {
    // asOf 23 Jul: the 24 Jul close (120) is not the `to` point.
    expect(windowReturn(WIN, "2026-07-23", 1)?.to).toBe("2026-07-23");
    // asOf 24 Jul: to = 120, from = index 0 → 120 / 100 − 1 = 0.2.
    expect(windowReturn(WIN, "2026-07-24", 5)?.return).toBeCloseTo(0.2, 12);
  });

  it("anchors on the last point on or before a non-trading asOf", () => {
    // asOf Sat 25 Jul → to = 24 Jul (120); 1 session back = 23 Jul (110). 120 / 110 − 1.
    const w = windowReturn(WIN, "2026-07-25", 1);
    expect(w?.to).toBe("2026-07-24");
    expect(w?.from).toBe("2026-07-23");
    expect(w?.return).toBeCloseTo(120 / 110 - 1, 12);
  });

  it("handles a fall", () => {
    // 21 Jul (101) vs 20 Jul (102): 101 / 102 − 1 = −0.0098039…
    expect(windowReturn(WIN, "2026-07-21", 1)?.return).toBeCloseTo(101 / 102 - 1, 12);
  });

  it("returns null for an empty series or asOf before the data", () => {
    expect(windowReturn(series([]), "2026-07-24", 1)).toBeNull();
    expect(windowReturn(WIN, "2026-07-16", 1)).toBeNull();
  });

  it("rejects a window that is not a positive whole number of sessions", () => {
    expect(() => windowReturn(WIN, "2026-07-24", 0)).toThrow(RangeError);
    expect(() => windowReturn(WIN, "2026-07-24", -2)).toThrow(RangeError);
    expect(() => windowReturn(WIN, "2026-07-24", 1.5)).toThrow(RangeError);
  });
});
