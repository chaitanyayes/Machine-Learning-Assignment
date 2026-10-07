import { describe, expect, it } from "vitest";
import { computeScenarioFacts, relevantNews } from "@/lib/compute/scenario";
import { scenarios } from "@/lib/data/load";

// Phase 1 acceptance in test form: every scenario's deterministic attribution
// level, computed from the generated data, matches data/scenarios.json.

describe("scenario facts", () => {
  for (const s of scenarios) {
    it(`${s.id} (${s.companyId}) computes ${s.expectedAttributionLevel}`, () => {
      const f = computeScenarioFacts(s.id);
      expect(f.attribution.level).toBe(s.expectedAttributionLevel);
      expect(f.adjusted.points.at(-1)!.date).toBe(s.asOf);
      expect(f.window.stock.sessions).toBe(s.windowDays);
      for (const n of f.news) expect(n.date <= s.asOf).toBe(true);
    });
  }

  it("S10 shows the bonus issue: raw price about halves, adjusted barely moves", () => {
    const f = computeScenarioFacts("S10");
    expect(f.window.stockRaw.return).toBeLessThan(-0.45);
    expect(Math.abs(f.window.stock.return)).toBeLessThan(0.02);
    expect(f.actionsInWindow.map((a) => a.id)).toEqual(["A1"]);
  });

  it("S02 never sees prices after T0 even though Coastline's file runs to T1", () => {
    const f = computeScenarioFacts("S02");
    expect(f.adjusted.points.at(-1)!.date).toBe("2026-07-24");
    expect(f.market.points.at(-1)!.date).toBe("2026-07-24");
  });

  it("S01 attributes to the in-window results filing only", () => {
    const f = computeScenarioFacts("S01");
    expect(f.attribution.qualifyingNewsIds).toEqual(["N1"]);
  });

  it("S06 ignores the stale order win and S14 ignores same-day macro news", () => {
    expect(computeScenarioFacts("S06").attribution.qualifyingNewsIds).toEqual([]);
    expect(computeScenarioFacts("S14").attribution.qualifyingNewsIds).toEqual([]);
  });

  it("S05 flags the conflicting reports", () => {
    const f = computeScenarioFacts("S05");
    expect(f.attribution.hasConflict).toBe(true);
    expect(f.attribution.rule).toBe("partial_conflict");
  });

  it("relevantNews excludes future items and other companies", () => {
    const items = relevantNews("hindmark-life", "idx-finserv", "2026-07-24", { from: "2026-07-17", to: "2026-07-24" });
    expect(items.every((n) => n.companyId === "hindmark-life" || n.companyId === null)).toBe(true);
    expect(items.some((n) => n.id === "N1")).toBe(false);
  });
});
