import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatPercent, formatRupees, MINUS } from "@/lib/format";

describe("format", () => {
  it("formats percentages with a true minus and optional plus", () => {
    expect(formatPercent(0.0712)).toBe("7.1%");
    expect(formatPercent(0.0712, { signed: true })).toBe("+7.1%");
    expect(formatPercent(-0.12, { signed: true })).toBe(`${MINUS}12.0%`);
    expect(formatPercent(-0.0004, { signed: true })).toBe("0.0%");
    expect(formatPercent(0.27628, { decimals: 2 })).toBe("27.63%");
  });
  it("uses Indian digit grouping for rupees", () => {
    expect(formatRupees(128450)).toBe("₹1,28,450");
    expect(formatRupees(-410)).toBe(`${MINUS}₹410`);
    expect(formatRupees(1284.5, { decimals: 2 })).toBe("₹1,284.50");
    expect(formatRupees(10000000)).toBe("₹1,00,00,000");
  });
  it("formats plain numbers", () => {
    expect(formatNumber(24812.4)).toBe("24,812.40");
  });
  it("formats dates", () => {
    expect(formatDate("2026-07-24")).toBe("24 Jul 2026");
    expect(formatDate("2026-07-04", { withYear: false })).toBe("4 Jul");
    expect(() => formatDate("bad")).toThrow();
  });
});
