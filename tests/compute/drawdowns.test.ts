import { describe, it, expect } from "vitest";
import { DRAWDOWNS } from "@/lib/config";
import { tradingDays } from "@/lib/compute/calendar";
import { drawdownEpisodes } from "@/lib/compute/drawdowns";
import type { Series } from "@/lib/compute/series";

/** One point per trading day from `from`, with the given closes. */
function seriesFrom(from: string, closes: number[]): Series {
  const days = tradingDays(from, "2026-12-31");
  return { id: "TEST", points: closes.map((close, i) => ({ date: days[i]!, close })) };
}

// From Tue 8 Sep 2026; Mon 14 Sep is a holiday, so sessions skip it.
//   i  date    close
//   0  8 Sep   100   peak
//   1  9 Sep    89   89 ≤ 100 × 0.9 = 90 → episode 1 starts, peak 8 Sep
//   2  10 Sep   80   trough 80: 80/100 − 1 = −20%
//   3  11 Sep   95
//   4  15 Sep   80   touches the trough again; the first touch (10 Sep) stays the trough
//   5  16 Sep  100   back to 100 → recovered: trough→recovery 5 − 2 = 3, peak→recovery 5 − 0 = 5
//   6  17 Sep  125   new running peak
//   7  18 Sep  110   110 ≤ 125 × 0.9 = 112.5 → episode 2 starts, peak 17 Sep
//   8  21 Sep  100   trough 100: 100/125 − 1 = −20%
//   9  22 Sep  130   recovered: 9 − 8 = 1, 9 − 6 = 3
//  10  23 Sep  128   −1.5% from 130: no episode
const TWO = seriesFrom("2026-09-08", [100, 89, 80, 95, 80, 100, 125, 110, 100, 130, 128]);

const EPISODE_1 = {
  peakDate: "2026-09-08",
  peakClose: 100,
  troughDate: "2026-09-10",
  troughClose: 80,
  depth: expect.closeTo(-0.2, 12),
  recoveredDate: "2026-09-16",
  sessionsTroughToRecovery: 3,
  sessionsPeakToRecovery: 5,
};
const EPISODE_2 = {
  peakDate: "2026-09-17",
  peakClose: 125,
  troughDate: "2026-09-21",
  troughClose: 100,
  depth: expect.closeTo(-0.2, 12),
  recoveredDate: "2026-09-22",
  sessionsTroughToRecovery: 1,
  sessionsPeakToRecovery: 3,
};

describe("drawdownEpisodes", () => {
  it("finds two separate episodes in order, with depth and sessions to recover", () => {
    expect(drawdownEpisodes(TWO, "2026-09-23")).toEqual([EPISODE_1, EPISODE_2]);
  });

  it("keeps the first date of a trough that is reached twice", () => {
    // 10 Sep and 15 Sep both close at 80; trough→recovery counts from 10 Sep.
    const [first] = drawdownEpisodes(TWO, "2026-09-23");
    expect(first!.troughDate).toBe("2026-09-10");
    expect(first!.sessionsTroughToRecovery).toBe(3);
  });

  it("counts recovery when the close gets back exactly to the peak", () => {
    // 16 Sep closes at 100 = the 8 Sep peak.
    expect(drawdownEpisodes(TWO, "2026-09-16")).toEqual([EPISODE_1]);
  });

  it("finds one episode that recovers", () => {
    // 100, 110 (peak), 98 (98 ≤ 99 → start), 88 (trough: 88/110 − 1 = −20%), 95, 110 (recovered), 112.
    // Trough→recovery 5 − 3 = 2; peak→recovery 5 − 1 = 4.
    const s = seriesFrom("2026-06-01", [100, 110, 98, 88, 95, 110, 112]);
    expect(drawdownEpisodes(s, "2026-06-09")).toEqual([
      {
        peakDate: "2026-06-02",
        peakClose: 110,
        troughDate: "2026-06-04",
        troughClose: 88,
        depth: expect.closeTo(-0.2, 12),
        recoveredDate: "2026-06-08",
        sessionsTroughToRecovery: 2,
        sessionsPeakToRecovery: 4,
      },
    ]);
  });

  it("leaves an episode open when the close has not won back the peak by asOf", () => {
    // 100, 120 (peak), 105 (−12.5% → start), 96, 90 (trough: 90/120 − 1 = −25%), 100, 115 (< 120).
    const s = seriesFrom("2026-06-01", [100, 120, 105, 96, 90, 100, 115]);
    expect(drawdownEpisodes(s, "2026-06-09")).toEqual([
      {
        peakDate: "2026-06-02",
        peakClose: 120,
        troughDate: "2026-06-05",
        troughClose: 90,
        depth: expect.closeTo(-0.25, 12),
        recoveredDate: null,
        sessionsTroughToRecovery: null,
        sessionsPeakToRecovery: null,
      },
    ]);
  });

  it("never reads past asOf: a later recovery does not count", () => {
    // asOf 15 Sep: episode 1 is still open (the 16 Sep recovery is in the future).
    expect(drawdownEpisodes(TWO, "2026-09-15")).toEqual([
      { ...EPISODE_1, recoveredDate: null, sessionsTroughToRecovery: null, sessionsPeakToRecovery: null },
    ]);
    // asOf 18 Sep: episode 2 has started (110 ≤ 112.5) but its trough so far is 18 Sep.
    expect(drawdownEpisodes(TWO, "2026-09-18")[1]).toEqual({
      peakDate: "2026-09-17",
      peakClose: 125,
      troughDate: "2026-09-18",
      troughClose: 110,
      depth: expect.closeTo(110 / 125 - 1, 12),
      recoveredDate: null,
      sessionsTroughToRecovery: null,
      sessionsPeakToRecovery: null,
    });
  });

  it("does not count a 9% dip", () => {
    // 100, 100, 95, 91 (−9%), 96, 101 (new peak), 92 (92/101 − 1 = −8.9%).
    const s = seriesFrom("2026-06-01", [100, 100, 95, 91, 96, 101, 92]);
    expect(drawdownEpisodes(s, "2026-06-09")).toEqual([]);
  });

  it("respects a threshold override, and a tied peak dates from its latest close", () => {
    // Same series at 8%: 91 ≤ 100 × 0.92 = 92 → episode, peak = 2 Jun (the later of the two 100s).
    // Recovered on 8 Jun (101 ≥ 100): 5 − 3 = 2 and 5 − 1 = 4 sessions.
    // Then 92 ≤ 101 × 0.92 = 92.92 → a second, open episode from the 8 Jun peak.
    const s = seriesFrom("2026-06-01", [100, 100, 95, 91, 96, 101, 92]);
    expect(drawdownEpisodes(s, "2026-06-09", { threshold: 0.08 })).toEqual([
      {
        peakDate: "2026-06-02",
        peakClose: 100,
        troughDate: "2026-06-04",
        troughClose: 91,
        depth: expect.closeTo(-0.09, 12),
        recoveredDate: "2026-06-08",
        sessionsTroughToRecovery: 2,
        sessionsPeakToRecovery: 4,
      },
      {
        peakDate: "2026-06-08",
        peakClose: 101,
        troughDate: "2026-06-09",
        troughClose: 92,
        depth: expect.closeTo(92 / 101 - 1, 12),
        recoveredDate: null,
        sessionsTroughToRecovery: null,
        sessionsPeakToRecovery: null,
      },
    ]);
  });

  it("restarts the running peak at the recovery close", () => {
    // 100, 85 (−15%), 105 (recovered; new peak 105), 94: 94/105 − 1 = −10.5% → a second episode.
    // Measured from the old peak (100), 94 would only be −6%.
    const s = seriesFrom("2026-06-01", [100, 85, 105, 94]);
    const eps = drawdownEpisodes(s, "2026-06-04");
    expect(eps.map((e) => [e.peakDate, e.troughDate, e.recoveredDate])).toEqual([
      ["2026-06-01", "2026-06-02", "2026-06-03"],
      ["2026-06-03", "2026-06-04", null],
    ]);
  });

  it("counts a fall of exactly the threshold", () => {
    // 100 → 90: 90 ≤ 100 × (1 − 0.1) = 90.
    const s = seriesFrom("2026-06-01", [100, 90]);
    expect(drawdownEpisodes(s, "2026-06-02")).toHaveLength(1);
  });

  it("uses the config threshold by default", () => {
    expect(drawdownEpisodes(TWO, "2026-09-23")).toEqual(drawdownEpisodes(TWO, "2026-09-23", { threshold: DRAWDOWNS.threshold }));
  });

  it("starts the running peak at `from`", () => {
    // from 17 Sep: only episode 2 is in range, with the same session counts.
    expect(drawdownEpisodes(TWO, "2026-09-23", { from: "2026-09-17" })).toEqual([EPISODE_2]);
    // from 11 Sep (95): 15 Sep's 80 is 80/95 − 1 = −15.8% → an episode peaking 11 Sep,
    // recovered 16 Sep (100 ≥ 95): 1 session from the trough, 2 from the peak.
    expect(drawdownEpisodes(TWO, "2026-09-23", { from: "2026-09-11" })[0]).toEqual({
      peakDate: "2026-09-11",
      peakClose: 95,
      troughDate: "2026-09-15",
      troughClose: 80,
      depth: expect.closeTo(80 / 95 - 1, 12),
      recoveredDate: "2026-09-16",
      sessionsTroughToRecovery: 1,
      sessionsPeakToRecovery: 2,
    });
  });

  it("returns no episodes for empty input, one point, an asOf before the data or from after asOf", () => {
    expect(drawdownEpisodes({ id: "EMPTY", points: [] }, "2026-09-23")).toEqual([]);
    expect(drawdownEpisodes(seriesFrom("2026-06-01", [100]), "2026-06-01")).toEqual([]);
    expect(drawdownEpisodes(TWO, "2026-09-07")).toEqual([]);
    expect(drawdownEpisodes(TWO, "2026-09-15", { from: "2026-09-16" })).toEqual([]);
  });

  it("uses all the data when asOf is after the last point", () => {
    expect(drawdownEpisodes(TWO, "2027-01-01")).toEqual([EPISODE_1, EPISODE_2]);
  });

  it("rejects a threshold outside (0, 1)", () => {
    expect(() => drawdownEpisodes(TWO, "2026-09-23", { threshold: 0 })).toThrow(RangeError);
    expect(() => drawdownEpisodes(TWO, "2026-09-23", { threshold: 1 })).toThrow(RangeError);
  });
});
