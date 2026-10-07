import { describe, it, expect } from "vitest";
import scenariosJson from "@/data/scenarios.json";
import { ATTRIBUTION } from "@/lib/config";
import {
  computeAttribution,
  qualifyingNews,
  type AttributionRule,
  type NewsLike,
} from "@/lib/compute/attribution";
import { decomposeMove } from "@/lib/compute/decompose";
import type { AttributionLevel } from "@/lib/data/schemas";

const item = (id: string, companyId: string | null, date: string, tags: string[]): NewsLike => ({
  id,
  companyId,
  date,
  tags,
});

// Windows (base day → last day) on the simulated calendar. Base days were
// counted back in trading sessions; 26 Jun 2026 is a holiday.
const W5 = { from: "2026-07-17", to: "2026-07-24" }; // 5 sessions to T0
const W21 = { from: "2026-06-24", to: "2026-07-24" }; // 21 sessions to T0
const W126 = { from: "2026-01-16", to: "2026-07-24" }; // 126 sessions to T0
const W5_S11 = { from: "2026-07-14", to: "2026-07-21" }; // 5 sessions to 21 Jul (delayed feed)
const W15_T1 = { from: "2026-07-24", to: "2026-08-14" }; // 15 sessions, T0 → T1

type ScenarioCase = {
  id: string;
  companyId: string;
  window: { from: string; to: string };
  stock: number;
  sector: number;
  market: number;
  news: NewsLike[];
  level: AttributionLevel;
  rule: AttributionRule;
  qualifying: string[];
};

// PLAN.md §4.3. tol = max(0.015, 0.25 × |stock|).
const SCENARIOS: ScenarioCase[] = [
  {
    // tol = max(0.015, 0.0175) = 0.0175. |0.07 − 0.008| = 0.062 > tol; |0.07 − 0.03| = 0.04 > tol.
    // Results filing qualifies. Residual 0.04 ≥ 0.03 and 0.04 / 0.07 = 0.57 ≥ 0.5 → CLEAR.
    id: "S01",
    companyId: "hindmark-bank",
    window: W5,
    stock: 0.07,
    sector: 0.03,
    market: 0.008,
    news: [item("N1", "hindmark-bank", "2026-07-22", ["company_event"])],
    level: "CLEAR",
    rule: "clear",
    qualifying: ["N1"],
  },
  {
    // tol = max(0.015, 0.0125) = 0.015. |0.05 − 0.015| = 0.035 > tol; |0.05 − 0.048| = 0.002 ≤ tol → SECTOR_WIDE.
    id: "S02",
    companyId: "coastline-bank",
    window: W21,
    stock: 0.05,
    sector: 0.048,
    market: 0.015,
    news: [],
    level: "SECTOR_WIDE",
    rule: "sector_close",
    qualifying: [],
  },
  {
    // tol = 0.0225. 0.082 and 0.08 > tol. Both items are company_event (also temporary_event).
    // Residual 0.08, share 0.89 → CLEAR.
    id: "S03",
    companyId: "meridian-motors",
    window: W5,
    stock: 0.09,
    sector: 0.01,
    market: 0.008,
    news: [
      item("N3", "meridian-motors", "2026-07-21", ["company_event", "temporary_event"]),
      item("N4", "meridian-motors", "2026-07-22", ["company_event", "temporary_event"]),
    ],
    level: "CLEAR",
    rule: "clear",
    qualifying: ["N3", "N4"],
  },
  {
    // tol = 0.03. |−0.12 − 0.008| = 0.128 > tol; |−0.12 + 0.02| = 0.10 > tol.
    // Residual −0.10: |−0.10| ≥ 0.03 and 0.10 / 0.12 = 0.83 ≥ 0.5 → CLEAR.
    id: "S04",
    companyId: "northstar-infotech",
    window: W5,
    stock: -0.12,
    sector: -0.02,
    market: 0.008,
    news: [item("N5", "northstar-infotech", "2026-07-20", ["company_event"])],
    level: "CLEAR",
    rule: "clear",
    qualifying: ["N5"],
  },
  {
    // tol = 0.015. 0.058 and 0.045 > tol. Two qualifying items share conflict:skyreach-stake
    // → PARTIAL (the residual −0.045, share 0.9, would otherwise be CLEAR).
    id: "S05",
    companyId: "skyreach-telecom",
    window: W5,
    stock: -0.05,
    sector: -0.005,
    market: 0.008,
    news: [
      item("N6", "skyreach-telecom", "2026-07-21", ["company_event", "conflict:skyreach-stake"]),
      item("N7", "skyreach-telecom", "2026-07-22", ["company_event", "conflict:skyreach-stake"]),
    ],
    level: "PARTIAL",
    rule: "partial_conflict",
    qualifying: ["N6", "N7"],
  },
  {
    // tol = 0.015. |0.04 − 0.015| = 0.025 > tol; |0.04 − 0.01| = 0.03 > tol.
    // The order win (20 Mar) is outside the window and 126 days old → nothing qualifies → UNCLEAR.
    id: "S06",
    companyId: "kirti-engineering",
    window: W21,
    stock: 0.04,
    sector: 0.01,
    market: 0.015,
    news: [item("N8", "kirti-engineering", "2026-03-20", ["company_event"])],
    level: "UNCLEAR",
    rule: "no_news",
    qualifying: [],
  },
  {
    // tol = 0.015. 0.032 and 0.035 > tol. A routine AGM notice never qualifies → UNCLEAR.
    id: "S07",
    companyId: "sahyog-finance",
    window: W5,
    stock: 0.04,
    sector: 0.005,
    market: 0.008,
    news: [item("N9", "sahyog-finance", "2026-07-21", ["routine", "injection_test"])],
    level: "UNCLEAR",
    rule: "no_news",
    qualifying: [],
  },
  {
    // tol = 0.1. 0.385 and 0.38 > tol. A clarification filing and price commentary → UNCLEAR.
    id: "S08",
    companyId: "brightpath-learning",
    window: W21,
    stock: 0.4,
    sector: 0.02,
    market: 0.015,
    news: [
      item("N10", "brightpath-learning", "2026-07-15", ["clarification", "disclosure"]),
      item("N11", "brightpath-learning", "2026-07-20", ["price_commentary"]),
    ],
    level: "UNCLEAR",
    rule: "no_news",
    qualifying: [],
  },
  {
    // tol = max(0.015, 0.0375) = 0.0375. |−0.15 − 0.04| = 0.19 > tol; |−0.15 + 0.13| = 0.02 ≤ tol → SECTOR_WIDE.
    id: "S09",
    companyId: "dhanvi-consumer",
    window: W126,
    stock: -0.15,
    sector: -0.13,
    market: 0.04,
    news: [],
    level: "SECTOR_WIDE",
    rule: "sector_close",
    qualifying: [],
  },
  {
    // Adjusted prices: tol = 0.015. |0.009 − 0.008| = 0.001 ≤ tol → MARKET_WIDE.
    id: "S10",
    companyId: "rangoli-paints",
    window: W5,
    stock: 0.009,
    sector: 0.006,
    market: 0.008,
    news: [item("N12", "rangoli-paints", "2026-07-21", ["corporate_action"])],
    level: "MARKET_WIDE",
    rule: "market_close",
    qualifying: [],
  },
  {
    // tol = 0.015. |0.012 − 0.006| = 0.006 ≤ tol → MARKET_WIDE.
    id: "S11",
    companyId: "prakriti-energy",
    window: W5_S11,
    stock: 0.012,
    sector: 0.01,
    market: 0.006,
    news: [],
    level: "MARKET_WIDE",
    rule: "market_close",
    qualifying: [],
  },
  {
    // Five +5% circuits: 1.05^5 − 1 = 0.2762815625. tol = 0.069. 0.268 and 0.266 > tol.
    // Social-media buzz is price_commentary → UNCLEAR.
    id: "S12",
    companyId: "kestrel-renewables",
    window: W5,
    stock: 1.05 ** 5 - 1,
    sector: 0.01,
    market: 0.008,
    news: [item("N13", "kestrel-renewables", "2026-07-22", ["price_commentary"])],
    level: "UNCLEAR",
    rule: "no_news",
    qualifying: [],
  },
  {
    // tol = 0.015. |0.004 − 0.008| = 0.004 ≤ tol → MARKET_WIDE. The sibling bank's results
    // (a different companyId) do not qualify for the insurer.
    id: "S13",
    companyId: "hindmark-life",
    window: W5,
    stock: 0.004,
    sector: 0.005,
    market: 0.008,
    news: [item("N1", "hindmark-bank", "2026-07-22", ["company_event"])],
    level: "MARKET_WIDE",
    rule: "market_close",
    qualifying: [],
  },
  {
    // tol = 0.015. |0.06 − 0.008| = 0.052 > tol; |0.06 − 0.005| = 0.055 > tol.
    // The 23 Jul macro item has companyId null → nothing qualifies → UNCLEAR.
    id: "S14",
    companyId: "aushadh-pharma",
    window: W5,
    stock: 0.06,
    sector: 0.005,
    market: 0.008,
    news: [item("N14", null, "2026-07-23", ["macro"])],
    level: "UNCLEAR",
    rule: "no_news",
    qualifying: [],
  },
  {
    // tol = max(0.015, 0.0275) = 0.0275. |−0.11 + 0.09| = 0.02 ≤ tol → MARKET_WIDE.
    id: "S15",
    companyId: "coastline-bank",
    window: W15_T1,
    stock: -0.11,
    sector: -0.1,
    market: -0.09,
    news: [],
    level: "MARKET_WIDE",
    rule: "market_close",
    qualifying: [],
  },
];

const attribute = (stock: number, sector: number, market: number, news: readonly NewsLike[] = []) =>
  computeAttribution({ stock, sector, market, qualifyingNews: news });

const EVENT = [item("E1", "x", "2026-07-22", ["company_event"])];

describe("scenario-shaped cases (PLAN.md §4.3)", () => {
  for (const c of SCENARIOS) {
    it(`${c.id} → ${c.level}`, () => {
      const q = qualifyingNews(c.news, c.companyId, c.window);
      const r = computeAttribution({ stock: c.stock, sector: c.sector, market: c.market, qualifyingNews: q });
      expect(r.level).toBe(c.level);
      expect(r.rule).toBe(c.rule);
      expect(r.qualifyingNewsIds).toEqual(c.qualifying);
    });
  }

  it("covers all 15 scenarios with the levels in data/scenarios.json", () => {
    const expected = Object.fromEntries(scenariosJson.map((s) => [s.id, s.expectedAttributionLevel]));
    expect(SCENARIOS.map((c) => c.id)).toEqual(Object.keys(expected));
    for (const c of SCENARIOS) expect(c.level).toBe(expected[c.id]);
  });

  it("S10 on raw prices would read as an unexplained crash", () => {
    // Raw −0.50: tol = 0.125. |−0.5 − 0.008| = 0.508, |−0.5 − 0.006| = 0.506 > tol.
    // The bonus notice is corporate_action, not company_event → UNCLEAR. Hence adjusted prices.
    const news = [item("N12", "rangoli-paints", "2026-07-21", ["corporate_action"])];
    const q = qualifyingNews(news, "rangoli-paints", W5);
    expect(attribute(-0.5, 0.006, 0.008, q).level).toBe("UNCLEAR");
  });

  it("S05 without the shared conflict tag would be CLEAR", () => {
    // Residual −0.05 − (−0.005) = −0.045: |·| ≥ 0.03 and 0.045 / 0.05 = 0.9 ≥ 0.5.
    const news = [
      item("N6", "skyreach-telecom", "2026-07-21", ["company_event", "conflict:skyreach-stake"]),
      item("N7", "skyreach-telecom", "2026-07-22", ["company_event", "conflict:skyreach-other"]),
    ];
    const r = attribute(-0.05, -0.005, 0.008, news);
    expect(r.hasConflict).toBe(false);
    expect(r.level).toBe("CLEAR");
  });
});

describe("computeAttribution: 'close to' boundaries", () => {
  it("counts a gap exactly at the absolute tolerance as close to the market", () => {
    // stock 0.015 → tol = max(0.015, 0.00375) = 0.015. |0.015 − 0| = 0.015 ≤ tol.
    expect(attribute(0.015, -0.5, 0).level).toBe("MARKET_WIDE");
    // |0.015 − (−0.0001)| = 0.0151 > tol; |0.015 + 0.5| > tol; no news → UNCLEAR.
    expect(attribute(0.015, -0.5, -0.0001).level).toBe("UNCLEAR");
  });

  it("counts a gap exactly at the relative tolerance as close to the market", () => {
    // stock 0.08 → tol = max(0.015, 0.02) = 0.02. 0.08 − 0.06 = 0.02 (0.020000000000000004 in floats).
    expect(attribute(0.08, -0.1, 0.06).level).toBe("MARKET_WIDE");
    // 0.08 − 0.0599 = 0.0201 > tol.
    expect(attribute(0.08, -0.1, 0.0599).level).toBe("UNCLEAR");
  });

  it("counts a gap exactly at the absolute tolerance as close to the sector", () => {
    // stock 0.05 → tol = max(0.015, 0.0125) = 0.015. Market gap 0.1. |0.05 − 0.035| = 0.015 ≤ tol.
    expect(attribute(0.05, 0.035, -0.05).level).toBe("SECTOR_WIDE");
    // |0.05 − 0.0349| = 0.0151 > tol.
    expect(attribute(0.05, 0.0349, -0.05).level).toBe("UNCLEAR");
  });

  it("counts a gap exactly at the relative tolerance as close to the sector (fall)", () => {
    // stock −0.2 → tol = 0.05. Market gap 0.3. |−0.2 + 0.15| = 0.05 ≤ tol.
    expect(attribute(-0.2, -0.15, 0.1).level).toBe("SECTOR_WIDE");
    // |−0.2 + 0.1499| = 0.0501 > tol.
    expect(attribute(-0.2, -0.1499, 0.1).level).toBe("UNCLEAR");
  });

  it("checks the market before the sector", () => {
    // tol = 0.015. Market gap 0.002 and sector gap 0.005 are both close → market wins.
    const r = attribute(0.01, 0.005, 0.008, EVENT);
    expect(r.level).toBe("MARKET_WIDE");
    expect(r.rule).toBe("market_close");
  });

  it("checks closeness before news: a company event cannot override a market-wide move", () => {
    // S11 numbers with a qualifying event: still MARKET_WIDE.
    const r = attribute(0.012, 0.01, 0.006, EVENT);
    expect(r.level).toBe("MARKET_WIDE");
    expect(r.qualifyingNewsIds).toEqual(["E1"]);
  });
});

describe("computeAttribution: CLEAR vs PARTIAL", () => {
  it("is CLEAR with the residual exactly at both thresholds", () => {
    // tol = 0.015. Market gap 0.11; sector gap 0.03 > tol.
    // Residual 0.06 − 0.03 = 0.03 = clearResidual; 0.03 / 0.06 = 0.5 = clearShare.
    const r = attribute(0.06, 0.03, -0.05, EVENT);
    expect(r.level).toBe("CLEAR");
    expect(r.rule).toBe("clear");
  });

  it("is CLEAR at the thresholds for a fall too", () => {
    // Mirror of the above: residual −0.03, share 0.5.
    expect(attribute(-0.06, -0.03, 0.05, EVENT).level).toBe("CLEAR");
  });

  it("is PARTIAL when the residual is just under clearResidual", () => {
    // tol = 0.015. Sector gap 0.0299 > tol. Residual 0.0299 < 0.03 (share 0.6 is fine).
    const r = attribute(0.05, 0.0201, -0.05, EVENT);
    expect(r.level).toBe("PARTIAL");
    expect(r.rule).toBe("partial");
  });

  it("is PARTIAL when the residual is a big number but under half the move", () => {
    // stock 0.2 → tol = 0.05. Market gap 0.2; sector gap 0.0999 > tol.
    // Residual 0.0999 ≥ 0.03, but 0.0999 / 0.2 = 0.4995 < 0.5.
    expect(attribute(0.2, 0.1001, 0, EVENT).level).toBe("PARTIAL");
    // Sector 0.1: residual 0.1, share exactly 0.5 → CLEAR.
    expect(attribute(0.2, 0.1, 0, EVENT).level).toBe("CLEAR");
  });

  it("is UNCLEAR, not PARTIAL, for a moderate residual with no news", () => {
    // S14-like: residual 0.055 would be CLEAR with news, but there is none.
    expect(attribute(0.06, 0.005, 0.008).rule).toBe("no_news");
  });
});

describe("computeAttribution: conflicts", () => {
  const conflicting = [
    item("C1", "x", "2026-07-21", ["company_event", "conflict:stake"]),
    item("C2", "x", "2026-07-22", ["company_event", "conflict:stake"]),
  ];

  it("caps a would-be CLEAR at PARTIAL", () => {
    const r = attribute(0.07, 0.03, 0.008, conflicting);
    expect(r.level).toBe("PARTIAL");
    expect(r.rule).toBe("partial_conflict");
    expect(r.hasConflict).toBe(true);
  });

  it("does not override a market-wide reading, but still reports the conflict", () => {
    const r = attribute(0.009, 0.006, 0.008, conflicting);
    expect(r.level).toBe("MARKET_WIDE");
    expect(r.hasConflict).toBe(true);
  });

  it("needs two different items sharing the same conflict tag", () => {
    // One item, even with the tag listed twice, conflicts with nothing.
    const single = [item("C1", "x", "2026-07-21", ["company_event", "conflict:stake", "conflict:stake"])];
    expect(attribute(0.07, 0.03, 0.008, single).hasConflict).toBe(false);
    // Different conflict groups do not conflict with each other.
    const groups = [
      item("C1", "x", "2026-07-21", ["company_event", "conflict:a"]),
      item("C2", "x", "2026-07-22", ["company_event", "conflict:b"]),
    ];
    const r = attribute(0.07, 0.03, 0.008, groups);
    expect(r.hasConflict).toBe(false);
    expect(r.level).toBe("CLEAR");
  });

  it("reads the prefix from config", () => {
    const tagged = [
      item("C1", "x", "2026-07-21", ["company_event", "dispute:stake"]),
      item("C2", "x", "2026-07-22", ["company_event", "dispute:stake"]),
    ];
    expect(attribute(0.07, 0.03, 0.008, tagged).hasConflict).toBe(false);
    const r = computeAttribution(
      { stock: 0.07, sector: 0.03, market: 0.008, qualifyingNews: tagged },
      { ...ATTRIBUTION, conflictTagPrefix: "dispute:" },
    );
    expect(r.rule).toBe("partial_conflict");
  });
});

describe("computeAttribution: output", () => {
  it("attaches the additive decomposition", () => {
    const r = attribute(0.07, 0.03, 0.008, EVENT);
    expect(r.decomposition).toEqual(decomposeMove(0.07, 0.03, 0.008));
  });

  it("lists qualifying news ids in input order", () => {
    const news = [
      item("N9", "x", "2026-07-23", ["company_event"]),
      item("N2", "x", "2026-07-20", ["company_event"]),
      item("N5", "x", "2026-07-21", ["company_event"]),
    ];
    expect(attribute(0.07, 0.03, 0.008, news).qualifyingNewsIds).toEqual(["N9", "N2", "N5"]);
  });

  it("accepts threshold overrides", () => {
    // S14 numbers with closeAbs 0.06: |0.06 − 0.008| = 0.052 ≤ 0.06 → MARKET_WIDE.
    const r = computeAttribution(
      { stock: 0.06, sector: 0.005, market: 0.008, qualifyingNews: [] },
      { ...ATTRIBUTION, closeAbs: 0.06 },
    );
    expect(r.level).toBe("MARKET_WIDE");
  });

  it("handles a zero move", () => {
    // tol = 0.015; market 0 → gap 0 → MARKET_WIDE.
    expect(attribute(0, 0, 0).level).toBe("MARKET_WIDE");
  });
});

describe("qualifyingNews", () => {
  const CO = "hindmark-bank";

  it("keeps only this company's fresh company_event items inside (from, to]", () => {
    const news = [
      item("A", CO, "2026-07-22", ["company_event"]), // keep
      item("B", CO, "2026-07-17", ["company_event"]), // on window.from (base day) → drop
      item("C", CO, "2026-07-24", ["company_event", "temporary_event"]), // on window.to → keep
      item("D", CO, "2026-07-27", ["company_event"]), // after the window → drop
      item("E", CO, "2026-07-16", ["company_event"]), // before the window → drop
      item("F", CO, "2026-07-21", ["routine"]), // routine → drop
      item("G", CO, "2026-07-21", ["price_commentary"]), // buzz → drop
      item("H", "hindmark-life", "2026-07-22", ["company_event"]), // other company → drop
      item("I", null, "2026-07-23", ["macro", "company_event"]), // not company-specific → drop
    ];
    expect(qualifyingNews(news, CO, W5).map((n) => n.id)).toEqual(["A", "C"]);
  });

  it("drops a company_event on the window's base day", () => {
    expect(qualifyingNews([item("B", CO, W5.from, ["company_event"])], CO, W5)).toEqual([]);
  });

  it("drops routine and price_commentary items even inside the window", () => {
    const news = [item("F", CO, "2026-07-21", ["routine"]), item("G", CO, "2026-07-22", ["price_commentary"])];
    expect(qualifyingNews(news, CO, W5)).toEqual([]);
  });

  it("drops another company's company_event", () => {
    expect(qualifyingNews([item("H", "hindmark-life", "2026-07-22", ["company_event"])], CO, W5)).toEqual([]);
  });

  it("drops a stale company_event inside a long window", () => {
    // Window ends 24 Jul. 24 Jun is 30 days back (fresh, kept: limit is inclusive);
    // 23 Jun is 31 days back (stale); 20 Mar is 126 days back (S06's order win).
    const news = [
      item("FRESH", CO, "2026-06-24", ["company_event"]),
      item("STALE", CO, "2026-06-23", ["company_event"]),
      item("OLD", CO, "2026-03-20", ["company_event"]),
    ];
    expect(qualifyingNews(news, CO, W126).map((n) => n.id)).toEqual(["FRESH"]);
  });

  it("accepts a staleness override", () => {
    const news = [item("OLD", CO, "2026-03-20", ["company_event"])];
    expect(qualifyingNews(news, CO, W126, 126).map((n) => n.id)).toEqual(["OLD"]);
    expect(qualifyingNews(news, CO, W126, 125)).toEqual([]);
  });

  it("keeps input order and returns the original objects", () => {
    const later = { ...item("N2", CO, "2026-07-23", ["company_event"]), headline: "kept" };
    const earlier = item("N1", CO, "2026-07-20", ["company_event"]);
    const out = qualifyingNews([later, earlier], CO, W5);
    expect(out.map((n) => n.id)).toEqual(["N2", "N1"]);
    expect(out[0]).toBe(later);
  });

  it("returns an empty list for no news", () => {
    expect(qualifyingNews([], CO, W5)).toEqual([]);
  });
});
