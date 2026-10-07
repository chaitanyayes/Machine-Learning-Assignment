import { describe, expect, it } from "vitest";
import { isTradingDay, shiftSessions, tradingDays } from "@/lib/compute/calendar";
import { addDays, addMonths, daysBetween, monthKey, weekKey, weekday } from "@/lib/compute/dates";
import { assertValidSeries, closeOnOrBefore, indexOf, indexOnOrBefore, simpleReturn, sliceToAsOf } from "@/lib/compute/series";

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });
  it("adds months with end-of-month clamping", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2024-03-31", -1)).toBe("2024-02-29");
    expect(addMonths("2026-07-24", -36)).toBe("2023-07-24");
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
  });
  it("counts calendar days", () => {
    expect(daysBetween("2026-07-17", "2026-07-24")).toBe(7);
    expect(daysBetween("2026-07-24", "2026-07-17")).toBe(-7);
  });
  it("finds weekdays, month keys and Monday week keys", () => {
    expect(weekday("2026-07-24")).toBe(5);
    expect(monthKey("2026-07-24")).toBe("2026-07");
    expect(weekKey("2026-07-24")).toBe("2026-07-20");
    expect(weekKey("2026-07-20")).toBe("2026-07-20");
    expect(weekKey("2026-07-26")).toBe("2026-07-20");
  });
  it("rejects non-ISO input", () => {
    expect(() => addDays("24/07/2026", 1)).toThrow();
  });
});

describe("calendar", () => {
  it("skips weekends and listed holidays", () => {
    expect(isTradingDay("2026-07-24")).toBe(true);
    expect(isTradingDay("2026-07-25")).toBe(false);
    expect(isTradingDay("2025-08-15")).toBe(false);
    expect(isTradingDay("2026-01-26")).toBe(false);
  });
  it("lists trading days inclusively", () => {
    expect(tradingDays("2026-07-17", "2026-07-24")).toEqual([
      "2026-07-17", "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24",
    ]);
  });
  it("shifts by sessions in both directions", () => {
    expect(shiftSessions("2026-07-24", -5)).toBe("2026-07-17");
    expect(shiftSessions("2026-07-24", 15)).toBe("2026-08-14");
    expect(shiftSessions("2026-07-24", 0)).toBe("2026-07-24");
    expect(() => shiftSessions("2026-07-25", 1)).toThrow();
  });
});

describe("series helpers", () => {
  const s = {
    id: "X",
    points: [
      { date: "2026-07-20", close: 100 },
      { date: "2026-07-21", close: 102 },
      { date: "2026-07-23", close: 99 },
    ],
  };
  it("finds the last point on or before a date", () => {
    expect(indexOnOrBefore(s.points, "2026-07-19")).toBe(-1);
    expect(indexOnOrBefore(s.points, "2026-07-22")).toBe(1);
    expect(indexOnOrBefore(s.points, "2026-07-30")).toBe(2);
    expect(indexOf(s.points, "2026-07-22")).toBe(-1);
    expect(indexOf(s.points, "2026-07-23")).toBe(2);
    expect(closeOnOrBefore(s.points, "2026-07-22")?.close).toBe(102);
  });
  it("slices to asOf without mutating", () => {
    expect(sliceToAsOf(s, "2026-07-21").points).toHaveLength(2);
    expect(s.points).toHaveLength(3);
  });
  it("computes simple returns as fractions", () => {
    expect(simpleReturn(100, 107)).toBeCloseTo(0.07, 12);
  });
  it("validates ordering and positivity", () => {
    expect(() => assertValidSeries({ id: "bad", points: [{ date: "2026-07-21", close: 1 }, { date: "2026-07-20", close: 1 }] })).toThrow();
    expect(() => assertValidSeries({ id: "bad", points: [{ date: "2026-07-21", close: 0 }] })).toThrow();
  });
});
