import { isTradingDay, shiftSessions } from "@/lib/compute/calendar";
import { addDays } from "@/lib/compute/dates";
import { SNAPSHOT } from "@/lib/config";
import type { Anchor } from "./engine";

// Scenario targets for the price generator (PLAN.md §4.3). Every anchor is a
// price relative to the series' refDate price, so "rel 1 / 1.07 five sessions
// before T0" means "the stock rose 7.0% over the last 5 sessions".
//
// Anchors far in the past only set a plausible 3-year trend; anchors near T0
// are the scenario windows and must be exact. scripts/print-scenarios.ts
// recomputes every window from the generated files and checks it against
// data/scenarios.json.

export const START = "2023-06-01";
export const T0 = SNAPSHOT.T0;
export const T1 = SNAPSHOT.T1;

/** The trading day n sessions from T0 (negative = earlier). */
export const s = (n: number): string => shiftSessions(T0, n);

export type IndexTarget = {
  id: string;
  parent: string | null;
  beta: number;
  annualVol: number;
  refPrice: number;
  end: string;
  anchors: Anchor[];
};

export type StockTarget = {
  ticker: string;
  companyId: string;
  parent: string;
  beta: number;
  annualVol: number;
  /** Price (after any corporate action) at refDate. */
  refPrice: number;
  refDate: string;
  end: string;
  anchors: Anchor[];
};

const a = (date: string, rel: number): Anchor => ({ date, rel });

/** Half-yearly shape points that keep each 3-year history plausible (the walk is free between them). */
const MID_DATES = ["2023-12-15", "2024-06-14", "2024-12-13", "2025-06-13", "2025-12-12"] as const;
const shape = (...rels: [number, number, number, number, number]): Anchor[] =>
  MID_DATES.map((d, i) => a(d, rels[i]!));

export const INDEX_TARGETS: IndexTarget[] = [
  {
    id: "idx-market",
    parent: null,
    beta: 0,
    annualVol: 0.13,
    refPrice: 24812.4,
    end: T1,
    anchors: [
      a(START, 0.74),
      a(s(-126), 1 / 1.04), // 6 months +4.0% (S09)
      a(s(-21), 1 / 1.015), // 1 month +1.5% (S02, S06, S08)
      a(s(-8), 1 / 1.002 / 1.006), // 21 Jul window +0.6% (S11)
      a(s(-5), 1 / 1.008), // 5 days +0.8%
      a(s(-3), 1 / 1.002),
      a(s(5), 0.995),
      a(s(9), 0.95), // after the 6 Aug macro news (N30)
      a(T1, 0.91), // T0 → T1 −9.0% (S15)
    ],
  },
  {
    id: "idx-bank",
    parent: "idx-market",
    beta: 1.1,
    annualVol: 0.1,
    refPrice: 55340.6,
    end: T1,
    anchors: [a(START, 0.78), a("2026-03-13", 0.92), a("2026-04-17", 0.9), a("2026-05-15", 0.925), a(s(-21), 1 / 1.048), a(s(-5), 1 / 1.03), a(s(9), 0.945), a(T1, 0.9)],
  },
  { id: "idx-finserv", parent: "idx-market", beta: 1.0, annualVol: 0.11, refPrice: 26105.2, end: T0, anchors: [a(START, 0.8), a(s(-5), 1 / 1.005)] },
  { id: "idx-auto", parent: "idx-market", beta: 1.0, annualVol: 0.14, refPrice: 23490.8, end: T0, anchors: [a(START, 0.7), a(s(-5), 1 / 1.01)] },
  { id: "idx-it", parent: "idx-market", beta: 0.8, annualVol: 0.15, refPrice: 37210.5, end: T0, anchors: [a(START, 0.85), a(s(-5), 1 / 0.98)] },
  { id: "idx-telecom", parent: "idx-market", beta: 0.9, annualVol: 0.16, refPrice: 3105.7, end: T0, anchors: [a(START, 0.75), a(s(-5), 1 / 0.995)] },
  { id: "idx-capgoods", parent: "idx-market", beta: 1.1, annualVol: 0.15, refPrice: 71820.3, end: T0, anchors: [a(START, 0.6), a(s(-21), 1 / 1.01)] },
  { id: "idx-conssvc", parent: "idx-market", beta: 1.0, annualVol: 0.16, refPrice: 9845.1, end: T0, anchors: [a(START, 0.9), a(s(-21), 1 / 1.02)] },
  { id: "idx-fmcg", parent: "idx-market", beta: 0.6, annualVol: 0.1, refPrice: 52480.9, end: T0, anchors: [a(START, 0.95), a(s(-126), 1 / 0.87)] },
  { id: "idx-consdur", parent: "idx-market", beta: 0.9, annualVol: 0.13, refPrice: 38760.2, end: T0, anchors: [a(START, 0.85), a(s(-5), 1 / 1.006)] },
  {
    id: "idx-energy",
    parent: "idx-market",
    beta: 1.0,
    annualVol: 0.15,
    refPrice: 35990.4,
    end: T0,
    // +1.0% over the S11 window (s(-8) → s(-3)) and over the S12 window (s(-5) → T0).
    anchors: [a(START, 0.8), a(s(-8), 1 / 1.004 / 1.01), a(s(-5), 1 / 1.01), a(s(-3), 1 / 1.004)],
  },
  { id: "idx-pharma", parent: "idx-market", beta: 0.7, annualVol: 0.12, refPrice: 22315.6, end: T0, anchors: [a(START, 0.9), a(s(-5), 1 / 1.005)] },
];

/** Five historical spike weeks for Brightpath, each with a chosen follow-through month. */
function brightpathSpikes(): Anchor[] {
  const episodes: { weekStartFriday: string; level: number; weekRise: number; nextMonth: number }[] = [
    { weekStartFriday: "2023-11-10", level: 2.1, weekRise: 0.14, nextMonth: -0.08 },
    { weekStartFriday: "2024-04-05", level: 1.9, weekRise: 0.12, nextMonth: 0.05 },
    { weekStartFriday: "2024-10-04", level: 1.5, weekRise: 0.16, nextMonth: -0.12 },
    { weekStartFriday: "2025-06-06", level: 1.1, weekRise: 0.11, nextMonth: -0.06 },
    { weekStartFriday: "2026-01-09", level: 0.85, weekRise: 0.13, nextMonth: 0.03 },
  ];
  return episodes.flatMap((e) => {
    // Friday to the following Friday, so the weekly-close return is exactly weekRise.
    const weekEnd = addDays(e.weekStartFriday, 7);
    if (!isTradingDay(e.weekStartFriday) || !isTradingDay(weekEnd)) {
      throw new Error(`Brightpath spike week ${e.weekStartFriday} must start and end on trading Fridays`);
    }
    const after = shiftSessions(weekEnd, 21);
    const top = e.level * (1 + e.weekRise);
    return [a(e.weekStartFriday, e.level), a(weekEnd, top), a(after, top * (1 + e.nextMonth))];
  });
}

export const STOCK_TARGETS: StockTarget[] = [
  {
    // S01: +7.0% in 5 days; results on 22 Jul (s(-2)) carry most of the move above the sector.
    ticker: "HINDMARK", companyId: "hindmark-bank", parent: "idx-bank", beta: 1.0, annualVol: 0.12,
    refPrice: 1284.5, refDate: T0, end: T0,
    anchors: [a(START, 0.62), ...shape(0.7, 0.8, 0.76, 0.88, 0.95), a("2026-03-13", 0.9), a("2026-04-17", 0.86), a("2026-05-15", 0.88), a(s(-5), 1 / 1.07), a(s(-3), (1 / 1.07) * 1.012), a(s(-2), (1 / 1.07) * 1.012 * 1.042)],
  },
  {
    // S02: +5.0% over 21 sessions with the bank index. S15: −11% from T0 to T1. Two past drawdowns.
    ticker: "COASTBANK", companyId: "coastline-bank", parent: "idx-bank", beta: 1.0, annualVol: 0.13,
    refPrice: 412.3, refDate: T0, end: T1,
    anchors: [
      a(START, 0.85),
      a("2023-10-13", 0.86),
      a("2024-02-02", 0.8), a("2024-03-15", 0.68), a("2024-05-10", 0.81),
      a("2024-09-13", 0.9),
      a("2025-01-10", 0.95), a("2025-03-07", 0.82), a("2025-06-13", 0.96),
      a("2025-12-12", 0.93),
      a(s(-21), 1 / 1.05),
      a(s(9), 0.94),
      a(T1, 0.89),
    ],
  },
  {
    // S03: +9.0% in 5 days; index-inclusion news 20 Jul (s(-4)), block deal 22 Jul (s(-2)).
    ticker: "MERIDMOTOR", companyId: "meridian-motors", parent: "idx-auto", beta: 1.0, annualVol: 0.15,
    refPrice: 2142, refDate: T0, end: T0,
    anchors: [
      a(START, 0.55),
      ...shape(0.62, 0.78, 0.7, 0.84, 0.92),
      a(s(-5), 1 / 1.09),
      a(s(-4), (1 / 1.09) * 1.045),
      a(s(-2), (1 / 1.09) * 1.045 * 1.012),
      a(s(-1), (1 / 1.09) * 1.045 * 1.012 * 1.025),
    ],
  },
  {
    // S04: −12.0% in 5 days; outlook cut on 21 Jul (s(-3)).
    ticker: "NSTARINFO", companyId: "northstar-infotech", parent: "idx-it", beta: 1.0, annualVol: 0.14,
    refPrice: 1561, refDate: T0, end: T0,
    anchors: [a(START, 0.9), ...shape(0.95, 1.05, 1.18, 1.08, 1.15), a(s(-5), 1 / 0.88), a(s(-4), (1 / 0.88) * 0.995), a(s(-3), (1 / 0.88) * 0.995 * 0.905)],
  },
  {
    // S05: −5.0% in 5 days around two contradictory reports (22 and 23 Jul).
    ticker: "SKYREACH", companyId: "skyreach-telecom", parent: "idx-telecom", beta: 1.0, annualVol: 0.22,
    refPrice: 86.4, refDate: T0, end: T0,
    anchors: [a(START, 1.2), ...shape(1.1, 1.25, 1.0, 0.9, 1.02), a(s(-5), 1 / 0.95), a(s(-3), 1.04), a(s(-2), 1.0), a(s(-1), 1.012)],
  },
  {
    // S06: +4.0% over 21 sessions vs capital goods +1.0%; no fresh news.
    ticker: "KIRTIENG", companyId: "kirti-engineering", parent: "idx-capgoods", beta: 1.0, annualVol: 0.18,
    refPrice: 742, refDate: T0, end: T0,
    anchors: [a(START, 0.45), ...shape(0.55, 0.72, 0.68, 0.82, 0.9), a(s(-21), 1 / 1.04)],
  },
  {
    // S07: +4.0% in 5 days with almost no news.
    ticker: "SAHYOGFIN", companyId: "sahyog-finance", parent: "idx-finserv", beta: 1.0, annualVol: 0.2,
    refPrice: 212.6, refDate: T0, end: T0,
    anchors: [a(START, 0.9), ...shape(1.0, 1.15, 0.95, 0.88, 0.94), a(s(-5), 1 / 1.04)],
  },
  {
    // S08: +40% over 21 sessions after a long decline; five injected past spike weeks.
    ticker: "BRIGHTPATH", companyId: "brightpath-learning", parent: "idx-conssvc", beta: 1.0, annualVol: 0.38,
    refPrice: 63.2, refDate: T0, end: T0,
    anchors: [a(START, 2.4), ...brightpathSpikes(), a(s(-21), 1 / 1.4)],
  },
  {
    // S09: −15% over 126 sessions with FMCG −13%. 5-for-1 split in Sep 2024 (A4) is applied to raw prices.
    ticker: "DHANVICON", companyId: "dhanvi-consumer", parent: "idx-fmcg", beta: 1.0, annualVol: 0.09,
    refPrice: 3052, refDate: T0, end: T0,
    anchors: [a(START, 0.95), ...shape(1.0, 1.08, 1.12, 1.15, 1.2), a(s(-126), 1 / 0.85)],
  },
  {
    // S10: adjusted +0.9% in 5 days; the 1:1 bonus (A1, ex-date 22 Jul) halves the raw price.
    ticker: "RANGOLI", companyId: "rangoli-paints", parent: "idx-consdur", beta: 1.0, annualVol: 0.13,
    refPrice: 1190, refDate: T0, end: T0,
    anchors: [a(START, 0.8), ...shape(0.85, 0.95, 0.88, 0.92, 0.97), a(s(-5), 1 / 1.009)],
  },
  {
    // S11: feed stops on 21 Jul (s(-3)); +1.2% over the 5 sessions to then.
    ticker: "PRAKRITI", companyId: "prakriti-energy", parent: "idx-energy", beta: 1.0, annualVol: 0.16,
    refPrice: 318.4, refDate: s(-3), end: s(-3),
    anchors: [a(START, 0.75), ...shape(0.8, 0.9, 0.85, 0.95, 0.98), a(s(-8), 1 / 1.012)],
  },
  {
    // S12: five consecutive +5% upper-circuit sessions.
    ticker: "KESTREL", companyId: "kestrel-renewables", parent: "idx-energy", beta: 0.8, annualVol: 0.4,
    refPrice: 24.6, refDate: T0, end: T0,
    anchors: [
      a(START, 1.4),
      ...shape(1.5, 1.2, 1.0, 0.9, 0.85),
      a(s(-10), 0.8),
      ...[5, 4, 3, 2, 1].map((n) => a(s(-n), 1 / Math.pow(1.05, n))),
    ],
  },
  {
    // S13: +0.4% in 5 days, roughly with the market.
    ticker: "HINDMKLIFE", companyId: "hindmark-life", parent: "idx-finserv", beta: 1.0, annualVol: 0.12,
    refPrice: 628, refDate: T0, end: T0,
    anchors: [a(START, 0.9), ...shape(0.95, 1.05, 1.0, 0.92, 0.98), a(s(-5), 1 / 1.004)],
  },
  {
    // S14: +6.0% in 5 days, most of it on 23 Jul (s(-1)), the day of unrelated macro news.
    ticker: "AUSHADH", companyId: "aushadh-pharma", parent: "idx-pharma", beta: 1.0, annualVol: 0.14,
    refPrice: 1045, refDate: T0, end: T0,
    anchors: [a(START, 0.8), ...shape(0.85, 0.95, 0.9, 1.0, 0.97), a(s(-5), 1 / 1.06), a(s(-2), (1 / 1.06) * 1.008), a(s(-1), (1 / 1.06) * 1.008 * 1.045)],
  },
];
