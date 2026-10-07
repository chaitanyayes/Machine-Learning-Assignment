import { describe, it, expect } from "vitest";
import { valuationContext } from "@/lib/compute/valuation";

describe("valuationContext", () => {
  it("computes difference and ratio above the median", () => {
    // 30 − 20 = 10; 30 / 20 = 1.5.
    const v = valuationContext({ pe: 30, sectorMedianPe: 20 });
    expect(v.pe).toBe(30);
    expect(v.sectorMedianPe).toBe(20);
    expect(v.difference).toBeCloseTo(10, 12);
    expect(v.ratio).toBeCloseTo(1.5, 12);
  });

  it("computes a negative difference below the median", () => {
    // 15 − 20 = −5; 15 / 20 = 0.75.
    const v = valuationContext({ pe: 15, sectorMedianPe: 20 });
    expect(v.difference).toBeCloseTo(-5, 12);
    expect(v.ratio).toBeCloseTo(0.75, 12);
  });

  it("gives 0 and 1 when P/E equals the median", () => {
    expect(valuationContext({ pe: 22.4, sectorMedianPe: 22.4 })).toEqual({
      pe: 22.4,
      sectorMedianPe: 22.4,
      difference: 0,
      ratio: 1,
    });
  });

  it("is unrounded", () => {
    // 10 / 3 = 3.333…, 10 − 3 = 7.
    const v = valuationContext({ pe: 10, sectorMedianPe: 3 });
    expect(v.ratio).toBe(10 / 3);
    expect(v.difference).toBe(7);
  });

  it("returns null comparisons when P/E is null (loss-making company)", () => {
    expect(valuationContext({ pe: null, sectorMedianPe: 25 })).toEqual({
      pe: null,
      sectorMedianPe: 25,
      difference: null,
      ratio: null,
    });
  });

  it("returns null comparisons when the sector median is null", () => {
    expect(valuationContext({ pe: 18, sectorMedianPe: null })).toEqual({
      pe: 18,
      sectorMedianPe: null,
      difference: null,
      ratio: null,
    });
  });

  it("returns null comparisons when both are null", () => {
    expect(valuationContext({ pe: null, sectorMedianPe: null })).toEqual({
      pe: null,
      sectorMedianPe: null,
      difference: null,
      ratio: null,
    });
  });

  it("returns null comparisons when the median is zero or negative, keeping inputs as given", () => {
    expect(valuationContext({ pe: 18, sectorMedianPe: 0 })).toEqual({
      pe: 18,
      sectorMedianPe: 0,
      difference: null,
      ratio: null,
    });
    expect(valuationContext({ pe: 18, sectorMedianPe: -4 })).toEqual({
      pe: 18,
      sectorMedianPe: -4,
      difference: null,
      ratio: null,
    });
  });

  it("keeps a negative P/E as given and still compares it", () => {
    // −10 − 20 = −30; −10 / 20 = −0.5.
    const v = valuationContext({ pe: -10, sectorMedianPe: 20 });
    expect(v.pe).toBe(-10);
    expect(v.difference).toBeCloseTo(-30, 12);
    expect(v.ratio).toBeCloseTo(-0.5, 12);
  });

  it("carries numbers only, never a verdict word", () => {
    const cases = [
      { pe: 40, sectorMedianPe: 20 },
      { pe: 10, sectorMedianPe: 20 },
      { pe: null, sectorMedianPe: 20 },
    ];
    for (const c of cases) {
      const v = valuationContext(c);
      expect(Object.keys(v).sort()).toEqual(["difference", "pe", "ratio", "sectorMedianPe"]);
      for (const value of Object.values(v)) {
        expect(value === null || typeof value === "number").toBe(true);
      }
    }
  });

  it("ignores extra fields on a full fundamentals record", () => {
    const f = { companyId: "x", pe: 24, sectorMedianPe: 16, roe: 12 };
    expect(valuationContext(f)).toEqual({ pe: 24, sectorMedianPe: 16, difference: 8, ratio: 1.5 });
  });
});
