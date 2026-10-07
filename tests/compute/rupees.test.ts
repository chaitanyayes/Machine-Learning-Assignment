import { describe, it, expect } from "vitest";
import { RUPEES } from "@/lib/config";
import { riskHistory } from "@/lib/compute/risk";
import { roundToNearest, rupeeRisk } from "@/lib/compute/rupees";

describe("roundToNearest", () => {
  it("rounds symmetrically, halves away from zero", () => {
    expect(roundToNearest(415, 10)).toBe(420);
    expect(roundToNearest(-415, 10)).toBe(-420);
    expect(roundToNearest(414, 10)).toBe(410);
    expect(roundToNearest(-414, 10)).toBe(-410);
    expect(roundToNearest(416, 10)).toBe(420);
    expect(roundToNearest(-416, 10)).toBe(-420);
  });

  it("returns 0, never −0, below half a step", () => {
    expect(Object.is(roundToNearest(4, 10), 0)).toBe(true);
    expect(Object.is(roundToNearest(-4, 10), 0)).toBe(true);
    expect(Object.is(roundToNearest(-0, 10), 0)).toBe(true);
    expect(roundToNearest(0, 10)).toBe(0);
  });

  it("rounds exactly half a step up in magnitude", () => {
    expect(roundToNearest(5, 10)).toBe(10);
    expect(roundToNearest(-5, 10)).toBe(-10);
    expect(roundToNearest(1250, 100)).toBe(1300);
    expect(roundToNearest(-1250, 100)).toBe(-1300);
    expect(roundToNearest(1249, 100)).toBe(1200);
  });

  it("leaves multiples alone and handles large amounts", () => {
    expect(roundToNearest(1280, 10)).toBe(1280);
    expect(roundToNearest(-128_449, 10)).toBe(-128_450);
  });

  it("throws on a bad step or a non-finite value", () => {
    expect(() => roundToNearest(415, 0)).toThrow(/step/);
    expect(() => roundToNearest(415, -10)).toThrow(/step/);
    expect(() => roundToNearest(415, Number.NaN)).toThrow(/step/);
    expect(() => roundToNearest(Number.NaN, 10)).toThrow(/finite/);
    expect(() => roundToNearest(Number.POSITIVE_INFINITY, 10)).toThrow(/finite/);
  });
});

describe("rupeeRisk", () => {
  const RISK_FIGURES = {
    typicalBadMonth: -0.0812,
    worstMonth: { month: "2024-03", return: -0.1834 },
    maxDrawdown: { depth: -0.2312, peakDate: "2024-01-15", troughDate: "2024-06-04" },
  };

  it("converts each fraction to rupees, rounded to ₹10", () => {
    // 5000 × −0.0812 = −406 → −410; 5000 × −0.1834 = −917 → −920; 5000 × −0.2312 = −1156 → −1160.
    expect(rupeeRisk(5000, RISK_FIGURES)).toEqual({
      amount: 5000,
      typicalBadMonth: -410,
      worstMonth: -920,
      biggestFall: -1160,
    });
  });

  it("defaults to the configured rounding step", () => {
    expect(RUPEES.roundTo).toBe(10);
    expect(rupeeRisk(5000, RISK_FIGURES)).toEqual(rupeeRisk(5000, RISK_FIGURES, 10));
  });

  it("accepts a custom rounding step", () => {
    // 12345 × −0.0812 = −1002.4 → −1000; × −0.1834 = −2264.1 → −2300; × −0.2312 = −2854.2 → −2900.
    expect(rupeeRisk(12_345, RISK_FIGURES, 100)).toEqual({
      amount: 12_345,
      typicalBadMonth: -1000,
      worstMonth: -2300,
      biggestFall: -2900,
    });
  });

  it("passes through missing monthly stats", () => {
    const r = rupeeRisk(5000, { ...RISK_FIGURES, typicalBadMonth: null, worstMonth: null });
    expect(r.typicalBadMonth).toBeNull();
    expect(r.worstMonth).toBeNull();
    expect(r.biggestFall).toBe(-1160);
  });

  it("keeps gains positive and a zero drawdown at 0", () => {
    // A stock that only rose: typical bad month +0.012 → +60; no drawdown → 0 (not −0).
    const r = rupeeRisk(5000, {
      typicalBadMonth: 0.012,
      worstMonth: { month: "2025-02", return: 0.004 },
      maxDrawdown: { depth: 0, peakDate: "2025-01-01", troughDate: "2025-01-01" },
    });
    expect(r.typicalBadMonth).toBe(60);
    expect(r.worstMonth).toBe(20); // 5000 × 0.004 = 20
    expect(Object.is(r.biggestFall, 0)).toBe(true);
  });

  it("works on a real riskHistory result", () => {
    // 31 Jan 100 → 28 Feb 80: Feb −0.2 is the only complete month and the max drawdown.
    // 5000 × −0.2 = −1000 for all three.
    const risk = riskHistory(
      {
        id: "TEST",
        points: [
          { date: "2025-01-30", close: 100 },
          { date: "2025-01-31", close: 100 },
          { date: "2025-02-28", close: 80 },
          { date: "2025-03-03", close: 84 },
        ],
      },
      "2025-03-03",
    );
    expect(rupeeRisk(5000, risk)).toEqual({
      amount: 5000,
      typicalBadMonth: -1000,
      worstMonth: -1000,
      biggestFall: -1000,
    });
  });

  it("throws on an amount that isn't a positive finite number", () => {
    for (const amount of [0, -5000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => rupeeRisk(amount, RISK_FIGURES)).toThrow(/amount/);
    }
  });
});
