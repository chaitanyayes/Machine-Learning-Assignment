import { describe, it, expect } from "vitest";
import { decomposeMove } from "@/lib/compute/decompose";

const sumOfParts = (d: { market: number; sector: number; residual: number }) => d.market + d.sector + d.residual;

describe("decomposeMove", () => {
  it("splits S01's rise into market, sector-on-top and company parts", () => {
    // stock 7.0%, sector 3.0%, market 0.8%:
    //   market 0.008; sector 0.03 − 0.008 = 0.022; residual 0.07 − 0.03 = 0.04.
    const d = decomposeMove(0.07, 0.03, 0.008);
    expect(d.total).toBe(0.07);
    expect(d.market).toBe(0.008);
    expect(d.sector).toBeCloseTo(0.022, 12);
    expect(d.residual).toBeCloseTo(0.04, 12);
    expect(sumOfParts(d)).toBeCloseTo(d.total, 12);
  });

  it("keeps signs for a fall against a rising market (S04)", () => {
    // stock −12%, sector −2%, market +0.8%:
    //   market 0.008; sector −0.02 − 0.008 = −0.028; residual −0.12 − (−0.02) = −0.10.
    const d = decomposeMove(-0.12, -0.02, 0.008);
    expect(d.market).toBe(0.008);
    expect(d.sector).toBeCloseTo(-0.028, 12);
    expect(d.residual).toBeCloseTo(-0.1, 12);
    expect(sumOfParts(d)).toBeCloseTo(-0.12, 12);
  });

  it("gives a near-zero residual when the stock tracks its sector (S09)", () => {
    // −0.15, −0.13, +0.04: market 0.04; sector −0.17; residual −0.02.
    const d = decomposeMove(-0.15, -0.13, 0.04);
    expect(d.sector).toBeCloseTo(-0.17, 12);
    expect(d.residual).toBeCloseTo(-0.02, 12);
    expect(sumOfParts(d)).toBeCloseTo(-0.15, 12);
  });

  it("returns all zeros for no move", () => {
    expect(decomposeMove(0, 0, 0)).toEqual({ total: 0, market: 0, sector: 0, residual: 0 });
  });

  it("always sums to the stock move", () => {
    const cases: [number, number, number][] = [
      [0.4, 0.02, 0.015],
      [-0.11, -0.1, -0.09],
      [0.009, 0.006, 0.008],
      [0.2762815625, 0.01, 0.008],
      [-0.5, 0.006, 0.008],
    ];
    for (const [stock, sector, market] of cases) {
      const d = decomposeMove(stock, sector, market);
      expect(d.total).toBe(stock);
      expect(sumOfParts(d)).toBeCloseTo(stock, 12);
    }
  });
});
