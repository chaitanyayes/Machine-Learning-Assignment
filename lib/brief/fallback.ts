import { COMPUTED_IDS, type ContextPack, type PackComputed } from "@/lib/contextPack/build";
import type { AttributionLevel } from "@/lib/data/schemas";
import type { BriefWire, Claim } from "./schema";

// Deterministic fallback (build brief §7 step 6): computed facts only, every
// claim a FACT, used when generation fails twice or no model is available.
// It must pass the validator itself; tests/brief/fallback.test.ts checks that
// for every scenario.

export const FALLBACK_NOTICE = "We couldn't generate a full explanation for this stock right now.";

const HEADLINES: Record<AttributionLevel, string> = {
  CLEAR: "Moved more than its sector, with company news the same week",
  PARTIAL: "Moved more than its sector; the reason is only partly clear",
  MARKET_WIDE: "Moved about as much as the whole market",
  SECTOR_WIDE: "Moved about as much as its sector",
  UNCLEAR: "No clear company-specific reason found",
};

function get(pack: ContextPack, key: keyof typeof COMPUTED_IDS): PackComputed | undefined {
  return pack.computed.find((c) => c.key === key);
}

function moved(c: PackComputed): string {
  return c.direction === "up" ? `rose ${c.display}` : c.direction === "down" ? `fell ${c.display}` : "was roughly unchanged";
}

export function fallbackBrief(pack: ContextPack): BriefWire {
  let n = 0;
  const fact = (text: string, sourceIds: string[]): Claim => ({ id: `f${++n}`, text, type: "FACT", sourceIds });
  const name = pack.company.name;
  const days = get(pack, "window_sessions")!;
  const stock = get(pack, "stock_window")!;
  const sector = get(pack, "sector_window")!;
  const market = get(pack, "market_window")!;
  const raw = get(pack, "raw_window");

  const whatHappened: Claim[] = [
    fact(`${name}'s share price ${moved(stock)} over the last ${days.display}.`, [stock.id, days.id]),
    fact(`Over the same days, the ${pack.indexNames.sector} ${moved(sector)} and the ${pack.indexNames.market} ${moved(market)}.`, [sector.id, market.id]),
  ];
  const action = pack.corporateActions.find((a) => a.inWindow && (a.type === "bonus" || a.type === "split"));
  if (raw && action) {
    const what = action.type === "bonus" ? "bonus issue" : "stock split";
    whatHappened.push(fact(`The quoted price ${moved(raw)} on paper, in the same days as a ${what}, which changes the number of shares but not their total value.`, [raw.id, action.id]));
  }

  const gap = get(pack, "stock_vs_sector")!;
  const whatItMightMean: Claim[] = [
    fact(
      gap.direction === "flat"
        ? `The share price moved about the same as its sector index over these days.`
        : `The share price moved ${gap.display} ${gap.direction === "up" ? "more" : "less"} than its sector index over these days.`,
      [gap.id],
    ),
  ];

  const years = get(pack, "history_years")!;
  const fall = get(pack, "max_drawdown")!;
  const whatCouldGoWrong: Claim[] = [
    fact(`Its biggest fall from a high in the last ${years.display} was ${fall.display}.`, [fall.id, years.id]),
  ];
  const specific =
    pack.fundamentals.find((d) => d.id === "D9" && typeof d.value === "number" && d.value > 0) ??
    pack.fundamentals.find((d) => d.id === "D3" && typeof d.value === "number" && d.value < 0) ??
    pack.fundamentals.find((d) => d.id === "D4" && d.status === "ok") ??
    pack.fundamentals.find((d) => d.status === "ok");
  if (specific) whatCouldGoWrong.push(fact(`${specific.label}: ${specific.display}.`, [specific.id]));
  const missing = pack.fundamentals.filter((d) => d.status === "missing");
  if (missing.length > 0) {
    whatCouldGoWrong.push(fact(`Some company figures are not available: ${missing.map((d) => d.label.toLowerCase()).join("; ")}.`, missing.map((d) => d.id)));
  }

  return {
    companyId: pack.companyId,
    scenarioId: pack.scenarioId,
    asOf: pack.asOf,
    attribution: { level: pack.attributionLevel, headline: HEADLINES[pack.attributionLevel] },
    whatHappened,
    whatItMightMean,
    whatCouldGoWrong: whatCouldGoWrong.slice(0, 4),
    whatToCheck: [
      { text: "Read the company's latest results and filings in full.", why: "They show what the business itself reported." },
      { text: "Compare this stock's move with its sector and the whole market.", why: "A move shared by many stocks says little about this company." },
      { text: "Look at how far this stock has fallen in the past.", why: "Past falls show how bumpy holding it has been." },
    ],
    conflicts: [],
    cannotSay: [`Why the price moved: ${FALLBACK_NOTICE.replace(/\.$/, "")}.`],
    suggestedQuestions: [
      "How did this stock move compared with its sector?",
      "How far has this stock fallen in the past?",
      "What does the P/E ratio mean?",
    ],
  };
}
