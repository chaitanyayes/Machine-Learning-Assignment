import { describe, it, expect } from "vitest";
import { RISK } from "@/lib/config";
import { tradingDays } from "@/lib/compute/calendar";
import { calendarMonthReturns, percentile, riskHistory } from "@/lib/compute/risk";
import type { PricePoint, Series } from "@/lib/compute/series";

const series = (points: PricePoint[]): Series => ({ id: "TEST", points });
const build = (dates: readonly string[], close: (i: number, date: string) => number): PricePoint[] =>
  dates.map((date, i) => ({ date, close: close(i, date) }));
const pts = (rows: [string, number][]): PricePoint[] => rows.map(([date, close]) => ({ date, close }));

// Jan – 15 May 2025 on the simulated calendar, flat within each month:
//   Jan 23 sessions (idx 0–22) at 100, ends Fri 31 Jan
//   Feb 19 (idx 23–41, 26 Feb holiday) at 120, ends Fri 28 Feb
//   Mar 19 (idx 42–60, 14 + 31 Mar holidays) at 90, ends Fri 28 Mar
//   Apr 19 (idx 61–79) at 108, ends Wed 30 Apr
//   May 10 (idx 80–89, 1 May holiday) at 113.4 (= 108 × 1.05), still running on 15 May
// 90 points, 89 sessions.
const LEVEL: Record<string, number> = {
  "2025-01": 100,
  "2025-02": 120,
  "2025-03": 90,
  "2025-04": 108,
  "2025-05": 113.4,
};
const STEPS = build(tradingDays("2025-01-01", "2025-05-15"), (_, d) => LEVEL[d.slice(0, 7)]!);

// 300 sessions from 1 Jan 2025 (last one is 18 Mar 2026), for the 126-session rolling window.
const DAYS300 = tradingDays("2025-01-01", "2026-06-30").slice(0, 300);
const LAST300 = DAYS300[299]!;

describe("percentile", () => {
  it("interpolates between closest ranks (PERCENTILE.INC)", () => {
    // n = 5, h = (5 − 1) × 0.1 = 0.4 → 1 + 0.4 × (2 − 1) = 1.4
    expect(percentile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4, 12);
    // h = 3 × 0.5 = 1.5 → 2 + 0.5 × (3 − 2) = 2.5
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it("returns the min at p = 0 and the max at p = 1", () => {
    expect(percentile([3, -1, 7], 0)).toBe(-1);
    expect(percentile([3, -1, 7], 1)).toBe(7);
  });

  it("sorts its input without mutating it", () => {
    const values = [5, 1, 4, 2, 3];
    expect(percentile(values, 0.1)).toBeCloseTo(1.4, 12);
    expect(values).toEqual([5, 1, 4, 2, 3]);
  });

  it("handles negative returns and ties", () => {
    // h = 3 × 0.1 = 0.3 → −0.10 + 0.3 × (−0.05 − −0.10) = −0.085
    expect(percentile([0.04, -0.05, 0.02, -0.1], 0.1)).toBeCloseTo(-0.085, 12);
    // [2, 2, 2, 5]: h = 1.5 sits between two 2s → 2; h = 2.7 → 2 + 0.7 × 3 = 4.1
    expect(percentile([2, 5, 2, 2], 0.5)).toBe(2);
    expect(percentile([2, 5, 2, 2], 0.9)).toBeCloseTo(4.1, 12);
  });

  it("returns the only value of a single-element list", () => {
    expect(percentile([0.07], 0.1)).toBe(0.07);
  });

  it("throws on empty input, p outside [0, 1] and non-finite values", () => {
    expect(() => percentile([], 0.1)).toThrow(/no values/);
    expect(() => percentile([1, 2], -0.1)).toThrow(/\[0, 1\]/);
    expect(() => percentile([1, 2], 1.1)).toThrow(/\[0, 1\]/);
    expect(() => percentile([1, 2], Number.NaN)).toThrow(/\[0, 1\]/);
    expect(() => percentile([1, Number.NaN], 0.5)).toThrow(/finite/);
  });
});

describe("calendarMonthReturns", () => {
  it("skips the first month and the month containing asOf", () => {
    // Feb 120/100 − 1 = +0.2; Mar 90/120 − 1 = −0.25; Apr 108/90 − 1 = +0.2; May is running.
    const r = calendarMonthReturns(STEPS, "2025-05-15");
    expect(r.map((m) => m.month)).toEqual(["2025-02", "2025-03", "2025-04"]);
    expect(r[0]!.return).toBeCloseTo(0.2, 12);
    expect(r[1]!.return).toBeCloseTo(-0.25, 12);
    expect(r[2]!.return).toBeCloseTo(0.2, 12);
  });

  it("ignores points after asOf and drops the asOf month even on its last session", () => {
    for (const asOf of ["2025-04-15", "2025-04-30"]) {
      expect(calendarMonthReturns(STEPS, asOf).map((m) => m.month)).toEqual(["2025-02", "2025-03"]);
    }
  });

  it("includes the last data month when asOf is in a later month", () => {
    // May: 113.4 / 108 − 1 = +0.05 (data stops on 15 May, but asOf is in July).
    const r = calendarMonthReturns(STEPS, "2025-07-01");
    expect(r.map((m) => m.month)).toEqual(["2025-02", "2025-03", "2025-04", "2025-05"]);
    expect(r[3]!.return).toBeCloseTo(0.05, 12);
  });

  it("uses the last point of each month, not its high", () => {
    const p = pts([
      ["2025-01-30", 90],
      ["2025-01-31", 100],
      ["2025-02-14", 500],
      ["2025-02-28", 110],
      ["2025-03-03", 1],
    ]);
    // Feb: 110 / 100 − 1 = +0.1
    const r = calendarMonthReturns(p, "2025-03-03");
    expect(r).toHaveLength(1);
    expect(r[0]!.month).toBe("2025-02");
    expect(r[0]!.return).toBeCloseTo(0.1, 12);
  });

  it("skips a month whose previous calendar month has no prices", () => {
    // No February prices, so March isn't a one-month return; Apr 121/110 − 1 = +0.1.
    const p = pts([
      ["2025-01-31", 100],
      ["2025-03-28", 110],
      ["2025-04-30", 121],
    ]);
    const r = calendarMonthReturns(p, "2025-05-05");
    expect(r.map((m) => m.month)).toEqual(["2025-04"]);
    expect(r[0]!.return).toBeCloseTo(0.1, 12);
  });

  it("returns nothing without two complete months", () => {
    expect(calendarMonthReturns([], "2025-05-15")).toEqual([]);
    expect(calendarMonthReturns(STEPS, "2024-12-31")).toEqual([]); // before the data
    expect(calendarMonthReturns(STEPS, "2025-02-14")).toEqual([]); // Jan is first, Feb running
  });
});

describe("riskHistory: hand-made five-day series", () => {
  // Mon 3 – Fri 7 Mar 2025. Log levels 0, 0.01, −0.01, 0.02, 0.02, so the daily log
  // returns are +0.01, −0.02, +0.03, 0. Mean 0.005; deviations +0.005, −0.025, +0.025,
  // −0.005; Σd² = 0.0013; sample variance 0.0013 / 3; annualised √(0.0013/3 × 252) = √0.1092 ≈ 0.330454.
  const LOG_LEVELS = [0, 0.01, -0.01, 0.02, 0.02];
  const FIVE = build(tradingDays("2025-03-03", "2025-03-07"), (i) => 100 * Math.exp(LOG_LEVELS[i]!));
  const r = riskHistory(series(FIVE), "2025-03-07");

  it("reports the span used", () => {
    expect(r.from).toBe("2025-03-03");
    expect(r.to).toBe("2025-03-07");
    expect(r.sessions).toBe(4);
  });

  it("computes annualised volatility from the sample stdev of log returns", () => {
    expect(r.annualisedVol).toBeCloseTo(Math.sqrt(0.1092), 12); // ≈ 0.330454
  });

  it("finds the max drawdown", () => {
    // Peak e^0.01 on 4 Mar, trough e^−0.01 on 5 Mar: e^−0.02 − 1 ≈ −0.019801.
    expect(r.maxDrawdown.depth).toBeCloseTo(Math.exp(-0.02) - 1, 12);
    expect(r.maxDrawdown.peakDate).toBe("2025-03-04");
    expect(r.maxDrawdown.troughDate).toBe("2025-03-05");
  });

  it("has no monthly stats or rolling windows inside a single running month", () => {
    expect(r.worstMonth).toBeNull();
    expect(r.typicalBadMonth).toBeNull();
    expect(r.monthsUsed).toBe(0);
    expect(r.rollingFalls).toEqual({ windows: 0, withFall: 0, share: 0 });
  });
});

describe("riskHistory: monthly steps, shorter than 3 years", () => {
  const r = riskHistory(series(STEPS), "2025-05-15");

  it("uses all the history there is and says so", () => {
    expect(r.from).toBe("2025-01-01");
    expect(r.to).toBe("2025-05-15");
    expect(r.sessions).toBe(89);
  });

  it("computes volatility from four jumps among 89 daily returns", () => {
    // Non-zero log returns: a = ln 1.2 (twice), b = ln 0.75, c = ln 1.05; the other 85 are 0.
    // Sample variance = (Σx² − (Σx)²/89) / 88 → vol ≈ 0.6586.
    const a = Math.log(1.2);
    const b = Math.log(0.75);
    const c = Math.log(1.05);
    const sum = 2 * a + b + c;
    const sumSq = 2 * a * a + b * b + c * c;
    expect(r.annualisedVol).toBeCloseTo(Math.sqrt(((sumSq - (sum * sum) / 89) / 88) * 252), 12);
    expect(r.annualisedVol).toBeCloseTo(0.6586, 3);
  });

  it("finds the 25% fall from the February plateau", () => {
    // 90 / 120 − 1 = −0.25. Equal closes move the peak forward, so the peak is the last Feb session.
    expect(r.maxDrawdown).toEqual({ depth: -0.25, peakDate: "2025-02-28", troughDate: "2025-03-03" });
  });

  it("computes monthly stats on complete months only", () => {
    // Months: Feb +0.2, Mar −0.25, Apr +0.2 (May running).
    // Typical bad month: sorted [−0.25, 0.2, 0.2], h = 2 × 0.1 = 0.2 → −0.25 + 0.2 × 0.45 = −0.16.
    expect(r.monthsUsed).toBe(3);
    expect(r.worstMonth).toEqual({ month: "2025-03", return: -0.25 });
    expect(r.typicalBadMonth).toBeCloseTo(-0.16, 12);
  });

  it("has no 126-session windows in 90 points", () => {
    expect(r.rollingFalls).toEqual({ windows: 0, withFall: 0, share: 0 });
  });

  it("accepts config overrides", () => {
    // 21-point windows: 90 − 21 + 1 = 70 windows. Only windows holding both 28 Feb (idx 41)
    // and 3 Mar (idx 42) see the 25% fall: starts 22…41 → 20 windows, share 20/70 = 2/7.
    const rolling = riskHistory(series(STEPS), "2025-05-15", { ...RISK, rollingWindowSessions: 20 });
    expect(rolling.rollingFalls.windows).toBe(70);
    expect(rolling.rollingFalls.withFall).toBe(20);
    expect(rolling.rollingFalls.share).toBeCloseTo(2 / 7, 12);
    // Median of [−0.25, 0.2, 0.2] is 0.2.
    const median = riskHistory(series(STEPS), "2025-05-15", { ...RISK, typicalBadMonthPercentile: 0.5 });
    expect(median.typicalBadMonth).toBeCloseTo(0.2, 12);
  });

  it("never looks past asOf", () => {
    const upTo = STEPS.filter((p) => p.date <= "2025-04-30");
    const crashAfter = [...upTo, ...STEPS.filter((p) => p.date > "2025-04-30").map((p) => ({ ...p, close: 1 }))];
    const r1 = riskHistory(series(crashAfter), "2025-04-30");
    expect(r1).toEqual(riskHistory(series(upTo), "2025-04-30"));
    expect(r1.to).toBe("2025-04-30");
    expect(r1.monthsUsed).toBe(2); // Feb, Mar; April contains asOf
  });

  it("ends at the last price on or before asOf", () => {
    // Sat 17 May → Thu 15 May.
    expect(riskHistory(series(STEPS), "2025-05-17")).toEqual(r);
  });

  it("treats the month of the last price as incomplete when asOf is later", () => {
    // Prices stop on 15 May; with asOf in June, May still isn't counted as a full month.
    expect(riskHistory(series(STEPS), "2025-06-10")).toEqual(r);
  });
});

describe("riskHistory: 3-year lookback", () => {
  // 2 Jan 2023 – 24 Jul 2026, flat at 100 except a crash to 50 through Mar 2023 (before
  // the cut) and a dip to 90 through Jun 2025.
  const LONG = build(tradingDays("2023-01-02", "2026-07-24"), (_, d) =>
    d.startsWith("2023-03") ? 50 : d.startsWith("2025-06") ? 90 : 100,
  );

  it("starts at the last point on or before end − 3 years", () => {
    // End Wed 15 Jul 2026 → 15 Jul 2023 is a Saturday → base is Fri 14 Jul 2023.
    const r = riskHistory(series(LONG), "2026-07-15");
    expect(r.from).toBe("2023-07-14");
    expect(r.to).toBe("2026-07-15");
    expect(r.sessions).toBe(tradingDays("2023-07-14", "2026-07-15").length - 1); // 736
  });

  it("ignores the crash before the lookback", () => {
    // Peak Fri 30 May 2025, trough Mon 2 Jun 2025: 90 / 100 − 1 = −0.1.
    const r = riskHistory(series(LONG), "2026-07-15");
    expect(r.maxDrawdown.depth).toBeCloseTo(-0.1, 12);
    expect(r.maxDrawdown.peakDate).toBe("2025-05-30");
    expect(r.maxDrawdown.troughDate).toBe("2025-06-02");
  });

  it("counts complete months inside the lookback", () => {
    // Jul 2023 is first (skipped) and Jul 2026 is running: Aug 2023 … Jun 2026 = 35 months.
    // Returns: Jun 2025 −0.1, Jul 2025 +0.111…, 33 zeros. h = 34 × 0.1 = 3.4 → sorted[3..4] = 0.
    const r = riskHistory(series(LONG), "2026-07-15");
    expect(r.monthsUsed).toBe(35);
    expect(r.worstMonth?.month).toBe("2025-06");
    expect(r.worstMonth?.return).toBeCloseTo(-0.1, 12);
    expect(r.typicalBadMonth).toBe(0);
  });

  it("counts every 127-point window and finds no 15% fall", () => {
    // 737 points → 737 − 127 + 1 = 611 windows; the worst fall inside the lookback is 10%.
    const r = riskHistory(series(LONG), "2026-07-15");
    expect(r.rollingFalls).toEqual({ windows: 611, withFall: 0, share: 0 });
  });

  it("honours a shorter historyYears", () => {
    // 1 year back from 15 Jul 2026 is Wed 15 Jul 2025, after the June 2025 dip.
    const r = riskHistory(series(LONG), "2026-07-15", { ...RISK, historyYears: 1 });
    expect(r.from).toBe("2025-07-15");
    expect(r.maxDrawdown).toEqual({ depth: 0, peakDate: "2025-07-15", troughDate: "2025-07-15" });
  });
});

describe("riskHistory: rolling 6-month falls", () => {
  // 300 points → 300 − 127 + 1 = 174 windows (starts 0…173).

  it("finds no drawdown and no falls in a monotonic rise", () => {
    const r = riskHistory(series(build(DAYS300, (i) => 100 * 1.001 ** i)), LAST300);
    expect(r.maxDrawdown).toEqual({ depth: 0, peakDate: "2025-01-01", troughDate: "2025-01-01" });
    expect(r.rollingFalls).toEqual({ windows: 174, withFall: 0, share: 0 });
    expect(r.annualisedVol).toBeCloseTo(0, 12); // every log return is ln 1.001
    expect(r.worstMonth!.return).toBeGreaterThan(0);
    expect(r.typicalBadMonth!).toBeGreaterThan(0);
  });

  it("counts the windows that contain one sharp 20% fall", () => {
    // 100 for idx 0–199, 80 from idx 200. A window starting at s holds idx 199 and 200 when
    // s ≥ 200 − 126 = 74; starts 74…173 → 100 windows of 174.
    const r = riskHistory(series(build(DAYS300, (i) => (i < 200 ? 100 : 80))), LAST300);
    expect(r.rollingFalls.windows).toBe(174);
    expect(r.rollingFalls.withFall).toBe(100);
    expect(r.rollingFalls.share).toBeCloseTo(100 / 174, 12);
    expect(r.maxDrawdown.depth).toBeCloseTo(-0.2, 12);
    expect(r.maxDrawdown.peakDate).toBe(DAYS300[199]);
    expect(r.maxDrawdown.troughDate).toBe(DAYS300[200]); // later equal lows don't move it
  });

  it("counts a fall of exactly 15% and not one of 14.9%", () => {
    const exact = riskHistory(series(build(DAYS300, (i) => (i < 200 ? 100 : 85))), LAST300);
    expect(exact.rollingFalls.withFall).toBe(100);
    const under = riskHistory(series(build(DAYS300, (i) => (i < 200 ? 100 : 85.1))), LAST300);
    expect(under.rollingFalls.withFall).toBe(0);
  });

  it("does not count a slow 20% slide that never falls 15% within a window", () => {
    // 100 × 0.8^(i/250) until idx 250, then flat at 80. Any 126-session stretch falls
    // 1 − 0.8^(126/250) ≈ 10.6%, but the whole slide is 20%.
    const r = riskHistory(series(build(DAYS300, (i) => 100 * 0.8 ** (Math.min(i, 250) / 250))), LAST300);
    expect(r.rollingFalls).toEqual({ windows: 174, withFall: 0, share: 0 });
    expect(r.maxDrawdown.depth).toBeCloseTo(-0.2, 12);
    expect(r.maxDrawdown.peakDate).toBe(DAYS300[0]);
    expect(r.maxDrawdown.troughDate).toBe(DAYS300[250]);
  });
});

describe("riskHistory: ties", () => {
  const D = tradingDays("2025-03-03", "2025-03-06"); // Mon–Thu

  it("measures from the latest equal high", () => {
    // 100, 90, 100, 80: the 20% fall starts from the second 100 (5 Mar).
    const r = riskHistory(series(build(D, (i) => [100, 90, 100, 80][i]!)), "2025-03-06");
    expect(r.maxDrawdown.depth).toBeCloseTo(-0.2, 12);
    expect(r.maxDrawdown.peakDate).toBe("2025-03-05");
    expect(r.maxDrawdown.troughDate).toBe("2025-03-06");
  });

  it("keeps the earliest of two equal drawdowns", () => {
    const r = riskHistory(series(build(D, (i) => [100, 80, 100, 80][i]!)), "2025-03-06");
    expect(r.maxDrawdown.peakDate).toBe("2025-03-03");
    expect(r.maxDrawdown.troughDate).toBe("2025-03-04");
  });

  it("keeps the earliest of two equally bad months", () => {
    // Feb 90/100 − 1 = −0.1, Mar +0.111…, Apr 90/100 − 1 = −0.1; May running.
    // Typical bad month: sorted [−0.1, −0.1, 0.111], h = 0.2 → −0.1.
    const p = pts([
      ["2025-01-31", 100],
      ["2025-02-28", 90],
      ["2025-03-28", 100],
      ["2025-04-30", 90],
      ["2025-05-02", 95],
    ]);
    const r = riskHistory(series(p), "2025-05-02");
    expect(r.worstMonth?.month).toBe("2025-02");
    expect(r.worstMonth?.return).toBeCloseTo(-0.1, 12);
    expect(r.typicalBadMonth).toBeCloseTo(-0.1, 12);
  });
});

describe("riskHistory: errors", () => {
  it("throws without enough prices on or before asOf", () => {
    expect(() => riskHistory(series([]), "2025-05-15")).toThrow(/no prices on or before 2025-05-15/);
    expect(() => riskHistory(series(STEPS), "2024-12-31")).toThrow(/no prices/);
    // 1 and 2 Jan only: one daily return can't give a sample stdev.
    expect(() => riskHistory(series(STEPS), "2025-01-02")).toThrow(/at least 3 prices/);
  });

  it("throws on a bad close inside the lookback", () => {
    const bad = STEPS.map((p, i) => (i === 10 ? { ...p, close: 0 } : p));
    expect(() => riskHistory(series(bad), "2025-05-15")).toThrow(/bad close/);
  });

  it("throws on a malformed asOf", () => {
    expect(() => riskHistory(series(STEPS), "2025-5-15")).toThrow(/Not an ISO date/);
  });
});
