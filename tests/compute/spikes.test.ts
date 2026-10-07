import { describe, it, expect } from "vitest";
import { SPIKES } from "@/lib/config";
import { tradingDays } from "@/lib/compute/calendar";
import { priorSpikes, weeklyCloses } from "@/lib/compute/spikes";
import type { Series } from "@/lib/compute/series";

/** One point per trading day in [from, to]; each close holds until the next listed change. */
function stepSeries(from: string, to: string, changes: Record<string, number>): Series {
  let close = Number.NaN;
  const points = tradingDays(from, to).map((date) => {
    close = changes[date] ?? close;
    return { date, close };
  });
  return { id: "TEST", points };
}

// Mon 1 Jun – Fri 31 Jul 2026. Fri 26 Jun is a holiday, so that week ends Thu 25 Jun.
// Weekly closes and returns:
//   W 1 Jun  → 5 Jun   100
//   W 8 Jun  → 12 Jun  112   112/100 − 1 = +12%     spike A
//   W 15 Jun → 19 Jun  120   120/112 − 1 = +7.1%
//   W 22 Jun → 25 Jun  150   150/120 − 1 = +25%     spike B (Thursday close)
//   W 29 Jun → 3 Jul   135   135/150 − 1 = −10%
//   W 6 Jul  → 10 Jul  135   0%
//   W 13 Jul → 17 Jul  162   162/135 − 1 = +20%     spike C
//   W 20 Jul → 24 Jul  180   180/162 − 1 = +11.1%   spike D
//   W 27 Jul → 31 Jul  400   only visible with asOf after 24 Jul
// With followSessions = 3:
//   A: 12 Jun + 3 sessions (15, 16, 17 Jun) → 17 Jun 120: 120/112 − 1 = +7.14%
//   B: 25 Jun + 3 sessions (29, 30 Jun, 1 Jul; the holiday is skipped) → 1 Jul 135: −10%
//   C: 17 Jul + 3 sessions (20, 21, 22 Jul) → 22 Jul 170: 170/162 − 1 = +4.94%
//   D: 24 Jul + 3 sessions → 29 Jul, after asOf 24 Jul → no follow-through
const S = stepSeries("2026-06-01", "2026-07-31", {
  "2026-06-01": 100,
  "2026-06-12": 112,
  "2026-06-17": 120,
  "2026-06-25": 150,
  "2026-07-01": 135,
  "2026-07-17": 162,
  "2026-07-22": 170,
  "2026-07-24": 180,
  "2026-07-27": 400,
});
const FOLLOW = { followSessions: 3 };

describe("weeklyCloses", () => {
  it("takes the last point of each Monday–Friday week, including a short holiday week", () => {
    // 21 Sep – 9 Oct 2026; Fri 2 Oct is a holiday, so the middle week ends Thu 1 Oct.
    const days = tradingDays("2026-09-21", "2026-10-09");
    const points = days.map((date, i) => ({ date, close: 100 + i }));
    // Indices: 21–25 Sep → 0–4; 28 Sep–1 Oct → 5–8; 5–9 Oct → 9–13.
    expect(weeklyCloses(points)).toEqual([
      { week: "2026-09-21", date: "2026-09-25", close: 104 },
      { week: "2026-09-28", date: "2026-10-01", close: 108 },
      { week: "2026-10-05", date: "2026-10-09", close: 113 },
    ]);
  });

  it("keys a week by its Monday even when Monday is a holiday", () => {
    // Mon 14 Sep 2026 is a holiday: that week runs 15–18 Sep.
    const points = tradingDays("2026-09-15", "2026-09-18").map((date, i) => ({ date, close: 10 + i }));
    expect(weeklyCloses(points)).toEqual([{ week: "2026-09-14", date: "2026-09-18", close: 13 }]);
  });

  it("closes partial first and last weeks on their last available point", () => {
    // Wed 3 Jun → Tue 9 Jun: first week ends Fri 5 Jun, second is cut on Tue 9 Jun.
    const points = tradingDays("2026-06-03", "2026-06-09").map((date, i) => ({ date, close: 1 + i }));
    expect(weeklyCloses(points)).toEqual([
      { week: "2026-06-01", date: "2026-06-05", close: 3 },
      { week: "2026-06-08", date: "2026-06-09", close: 5 },
    ]);
  });

  it("returns nothing for no points", () => {
    expect(weeklyCloses([])).toEqual([]);
  });
});

describe("priorSpikes", () => {
  it("lists every spike with its follow-through and counts only the complete ones", () => {
    const h = priorSpikes(S, "2026-07-24", FOLLOW);
    expect(h.spikes).toEqual([
      { weekEnd: "2026-06-12", weekReturn: expect.closeTo(0.12, 12), followThrough: expect.closeTo(120 / 112 - 1, 12), followThroughEnd: "2026-06-17" },
      { weekEnd: "2026-06-25", weekReturn: expect.closeTo(0.25, 12), followThrough: expect.closeTo(-0.1, 12), followThroughEnd: "2026-07-01" },
      { weekEnd: "2026-07-17", weekReturn: expect.closeTo(0.2, 12), followThrough: expect.closeTo(170 / 162 - 1, 12), followThroughEnd: "2026-07-22" },
      { weekEnd: "2026-07-24", weekReturn: expect.closeTo(180 / 162 - 1, 12), followThrough: null, followThroughEnd: null },
    ]);
    // A +, B −, C + counted; D too recent.
    expect(h).toMatchObject({ counted: 3, positive: 2, excludedRecent: 1 });
  });

  it("leaves out spikes in the current window (week end after excludeFrom)", () => {
    // Current move measured from Fri 10 Jul: C (17 Jul) and D (24 Jul) are part of it.
    // What's left is A (follow-through +7.1%) and B (−10%): one of two positive.
    const h = priorSpikes(S, "2026-07-24", { ...FOLLOW, excludeFrom: "2026-07-10" });
    expect(h.spikes.map((s) => s.weekEnd)).toEqual(["2026-06-12", "2026-06-25"]);
    expect(h.spikes[0]!.followThrough).toBeGreaterThan(0);
    expect(h.spikes[1]!.followThrough).toBeLessThan(0);
    expect(h).toMatchObject({ counted: 2, positive: 1, excludedRecent: 0 });
  });

  it("keeps a spike whose week ends exactly on excludeFrom", () => {
    // excludeFrom 17 Jul: C's week ends on it (not after), so only D is dropped.
    const h = priorSpikes(S, "2026-07-24", { ...FOLLOW, excludeFrom: "2026-07-17" });
    expect(h.spikes.map((s) => s.weekEnd)).toEqual(["2026-06-12", "2026-06-25", "2026-07-17"]);
    expect(h).toMatchObject({ counted: 3, positive: 2, excludedRecent: 0 });
  });

  it("does not count a spike whose follow-through ends after asOf, and never reads past asOf", () => {
    // asOf Tue 21 Jul: C's follow-through point (22 Jul) exists in the data but is after asOf.
    // The cut-off week 20–21 Jul closes at 162: 162/162 − 1 = 0, not a spike.
    const h = priorSpikes(S, "2026-07-21", FOLLOW);
    expect(h.spikes.map((s) => s.weekEnd)).toEqual(["2026-06-12", "2026-06-25", "2026-07-17"]);
    expect(h.spikes[2]).toEqual({ weekEnd: "2026-07-17", weekReturn: expect.closeTo(0.2, 12), followThrough: null, followThroughEnd: null });
    expect(h).toMatchObject({ counted: 2, positive: 1, excludedRecent: 1 });
  });

  it("uses a follow-through point that falls exactly on asOf", () => {
    // asOf 22 Jul: C's follow-through ends on asOf → counted. Week 20–22 Jul: 170/162 − 1 = +4.9%, no spike.
    const h = priorSpikes(S, "2026-07-22", FOLLOW);
    expect(h.spikes[2]!.followThroughEnd).toBe("2026-07-22");
    expect(h).toMatchObject({ counted: 3, positive: 2, excludedRecent: 0 });
  });

  it("ignores data after asOf even when it would complete a follow-through", () => {
    // asOf 24 Jul: D's follow-through point (29 Jul, close 400) must stay unread.
    const d = priorSpikes(S, "2026-07-24", FOLLOW).spikes[3]!;
    expect(d.followThrough).toBeNull();
    // With asOf past the data, D gets 29 Jul: 400/180 − 1 = +122%, and the 27–31 Jul week
    // (400/180 − 1) is a new spike E with no follow-through.
    const all = priorSpikes(S, "2026-12-31", FOLLOW);
    expect(all.spikes[3]!.followThrough).toBeCloseTo(400 / 180 - 1, 12);
    expect(all.spikes[4]).toEqual({ weekEnd: "2026-07-31", weekReturn: expect.closeTo(400 / 180 - 1, 12), followThrough: null, followThroughEnd: null });
    expect(all).toMatchObject({ counted: 4, positive: 3, excludedRecent: 1 });
  });

  it("uses the config threshold and a 21-session follow-through by default", () => {
    expect(priorSpikes(S, "2026-07-24")).toEqual(
      priorSpikes(S, "2026-07-24", { threshold: SPIKES.weeklyRiseThreshold, followSessions: SPIKES.followThroughSessions }),
    );
    // With threshold 0.10 and 21 sessions: A's follow-through is 21 sessions after 12 Jun.
    // 15–19 Jun (5), 22–25 Jun (9), 29–30 Jun (11), 1–3 Jul (14), 6–10 Jul (19), 13–14 Jul (21)
    // → 14 Jul close 135: 135/112 − 1 = +20.5%. B's 21st session is 27 Jul > asOf; C, D likewise.
    const h = priorSpikes(S, "2026-07-24", { threshold: 0.1, followSessions: 21 });
    expect(h.spikes[0]).toEqual({ weekEnd: "2026-06-12", weekReturn: expect.closeTo(0.12, 12), followThrough: expect.closeTo(135 / 112 - 1, 12), followThroughEnd: "2026-07-14" });
    expect(h).toMatchObject({ counted: 1, positive: 1, excludedRecent: 3 });
  });

  it("respects a threshold override, counting a week exactly at the threshold", () => {
    // threshold 0.25: only B (exactly +25%) qualifies; C at +20% does not.
    const h = priorSpikes(S, "2026-07-24", { ...FOLLOW, threshold: 0.25 });
    expect(h.spikes.map((s) => s.weekEnd)).toEqual(["2026-06-25"]);
    expect(h).toMatchObject({ counted: 1, positive: 0, excludedRecent: 0 });
  });

  it("counts a +10% week, but not +9.99%, at the default threshold", () => {
    // Week of 1 Jun closes 100; week of 8 Jun closes 110 (+10%) or 109.99 (+9.99%).
    const at = stepSeries("2026-06-01", "2026-06-19", { "2026-06-01": 100, "2026-06-12": 110 });
    const below = stepSeries("2026-06-01", "2026-06-19", { "2026-06-01": 100, "2026-06-12": 109.99 });
    expect(priorSpikes(at, "2026-06-19", FOLLOW).spikes.map((s) => s.weekEnd)).toEqual(["2026-06-12"]);
    expect(priorSpikes(below, "2026-06-19", FOLLOW).spikes).toEqual([]);
  });

  it("treats big falls as non-spikes and a flat follow-through as counted but not positive", () => {
    // Week 1: 100. Week 2: 60 (−40%, not a spike). Week 3: 72 (+20%, spike on 19 Jun).
    // 19 Jun + 3 sessions = 24 Jun, still 72: follow-through 72/72 − 1 = 0.
    const s = stepSeries("2026-06-01", "2026-06-25", { "2026-06-01": 100, "2026-06-12": 60, "2026-06-19": 72 });
    const h = priorSpikes(s, "2026-06-25", FOLLOW);
    expect(h.spikes).toEqual([{ weekEnd: "2026-06-19", weekReturn: expect.closeTo(0.2, 12), followThrough: 0, followThroughEnd: "2026-06-24" }]);
    expect(h).toMatchObject({ counted: 1, positive: 0, excludedRecent: 0 });
  });

  it("never treats the first week as a spike, since it has no previous week", () => {
    // A +50% rise inside the first week only; the second week is flat.
    const s = stepSeries("2026-06-01", "2026-06-12", { "2026-06-01": 100, "2026-06-05": 150 });
    expect(priorSpikes(s, "2026-06-12", FOLLOW).spikes).toEqual([]);
  });

  it("returns an empty history for empty input or an asOf before the data", () => {
    const empty = { spikes: [], counted: 0, positive: 0, excludedRecent: 0 };
    expect(priorSpikes({ id: "EMPTY", points: [] }, "2026-07-24")).toEqual(empty);
    expect(priorSpikes(S, "2026-05-29", FOLLOW)).toEqual(empty);
    // asOf Fri 5 Jun: a single week, nothing to compare with.
    expect(priorSpikes(S, "2026-06-05", FOLLOW)).toEqual(empty);
  });

  it("rejects a follow-through horizon that is not a positive whole number of sessions", () => {
    expect(() => priorSpikes(S, "2026-07-24", { followSessions: 0 })).toThrow(RangeError);
    expect(() => priorSpikes(S, "2026-07-24", { followSessions: 2.5 })).toThrow(RangeError);
  });
});
