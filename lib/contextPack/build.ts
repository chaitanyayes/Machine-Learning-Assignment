import { daysBetween } from "@/lib/compute/dates";
import { computeScenarioFacts, type ScenarioFacts } from "@/lib/compute/scenario";
import { getCompany, getFundamentals } from "@/lib/data/load";
import { FUNDAMENTAL_FIELDS, type AttributionLevel, type FundamentalField } from "@/lib/data/schemas";
import { formatDate, formatNumber, formatPercent, formatRupees } from "@/lib/format";

// The context pack is the ONLY input the model receives (build brief §6).
// Every item has a stable id: C* computed facts (fixed registry below, so C2
// is always the stock's window move), N*/A* the global ids from /data, D* one
// per fundamentals field, S the data status. Ids for facts that don't apply to
// a scenario are simply absent, never renumbered.

export type Direction = "up" | "down" | "flat";

export type PackComputed = {
  id: string;
  key: string;
  label: string;
  value: number | string;
  unit: string;
  display: string;
  direction?: Direction;
};

export type PackNews = {
  id: string;
  date: string;
  ageDays: number;
  isStale: boolean;
  inWindow: boolean;
  about: "this company" | "its sector" | "the whole market";
  sourceName: string;
  sourceType: string;
  headline: string;
  summary: string;
};

export type PackFundamental = {
  id: string;
  label: string;
  value: number | string | null;
  unit: string;
  display: string;
  status: "ok" | "missing" | "not_applicable";
};

export type PackAction = { id: string; type: string; exDate: string; ageDays: number; inWindow: boolean; details: string };

export type ContextPack = {
  scenarioId: string;
  companyId: string;
  company: { name: string; ticker: string; sector: string; description: string };
  siblings: { name: string; note: string }[];
  asOf: string;
  window: { tradingDays: number; from: string; to: string };
  attributionLevel: AttributionLevel;
  indexNames: { sector: string; market: string };
  computed: PackComputed[];
  news: PackNews[];
  fundamentals: PackFundamental[];
  corporateActions: PackAction[];
  dataStatus: { id: "S"; status: string; asOf: string; note?: string };
};

export type UnavailablePack = { unavailable: true; scenarioId: string; companyId: string; asOf: string };

/** Fixed registry: key → id. Never reuse or renumber an id. */
export const COMPUTED_IDS = {
  window_sessions: "C1",
  stock_window: "C2",
  sector_window: "C3",
  market_window: "C4",
  stock_vs_sector: "C5",
  raw_window: "C6",
  last_close: "C7",
  ret_1w: "C8",
  ret_1m: "C9",
  ret_6m: "C10",
  ret_1y: "C11",
  ret_3y: "C12",
  high_52w: "C13",
  low_52w: "C14",
  history_years: "C15",
  volatility: "C16",
  max_drawdown: "C17",
  max_drawdown_dates: "C18",
  worst_month: "C19",
  worst_month_name: "C20",
  typical_bad_month: "C21",
  rolling_fall_share: "C22",
  rupee_amount: "C23",
  rupee_typical_bad_month: "C24",
  rupee_worst_month: "C25",
  rupee_biggest_fall: "C26",
  spike_weeks: "C27",
  spike_weeks_positive: "C28",
  drawdown_count: "C29",
  drawdown_latest: "C30",
  sector_1m: "C31",
  market_1m: "C32",
} as const;
export type ComputedKey = keyof typeof COMPUTED_IDS;

export const FUNDAMENTAL_IDS: Record<FundamentalField, string> = Object.fromEntries(
  FUNDAMENTAL_FIELDS.map((f, i) => [f, `D${i + 1}`]),
) as Record<FundamentalField, string>;

const FUNDAMENTAL_META: Record<FundamentalField, { label: string; unit: string; kind: "pct" | "ratio" | "date" | "cr" }> = {
  revenueGrowth3y: { label: "Revenue growth per year, last 3 years", unit: "%", kind: "pct" },
  profitGrowth3y: { label: "Profit growth per year, last 3 years", unit: "%", kind: "pct" },
  netMargin: { label: "Net profit margin (profit as a share of revenue)", unit: "%", kind: "pct" },
  debtToEquity: { label: "Debt to equity (borrowing compared with shareholders' money)", unit: "ratio", kind: "ratio" },
  roe: { label: "Return on equity (profit compared with shareholders' money)", unit: "%", kind: "pct" },
  pe: { label: "P/E ratio (share price divided by yearly profit per share)", unit: "ratio", kind: "ratio" },
  sectorMedianPe: { label: "Middle P/E ratio of companies in the same sector", unit: "ratio", kind: "ratio" },
  promoterHoldingPct: { label: "Shares held by the promoter (the founding owners)", unit: "%", kind: "pct" },
  promoterPledgePct: { label: "Promoter shares pledged as security for loans", unit: "%", kind: "pct" },
  lastResultsDate: { label: "Date of the latest results", unit: "date", kind: "date" },
  revenueTtmCr: { label: "Revenue over the last 12 months", unit: "₹ crore", kind: "cr" },
  marketCapCr: { label: "Market value of all shares (market capitalisation)", unit: "₹ crore", kind: "cr" },
};

const SIBLING_NOTE = "A different company that shares a group name. Its news and results are not about this company.";

function direction(x: number): Direction {
  const r = Number((x * 100).toFixed(1));
  return r > 0 ? "up" : r < 0 ? "down" : "flat";
}

function pctFact(key: ComputedKey, label: string, fraction: number): PackComputed {
  return {
    id: COMPUTED_IDS[key],
    key,
    label,
    value: Number((fraction * 100).toFixed(1)),
    unit: "%",
    display: formatPercent(Math.abs(fraction)),
    direction: direction(fraction),
  };
}

function rupeeFact(key: ComputedKey, label: string, amount: number): PackComputed {
  return { id: COMPUTED_IDS[key], key, label, value: amount, unit: "₹", display: formatRupees(Math.abs(amount)) };
}

function textFact(key: ComputedKey, label: string, value: number | string, unit: string, display: string): PackComputed {
  return { id: COMPUTED_IDS[key], key, label, value, unit, display };
}

function monthLabel(month: string): string {
  return formatDate(`${month}-01`).replace(/^1 /, "");
}

export function computedFacts(f: ScenarioFacts): PackComputed[] {
  const n = f.scenario.windowDays;
  const out: PackComputed[] = [];
  const days = `${n} trading days`;
  out.push(textFact("window_sessions", "Length of the period being explained", n, "trading days", days));
  out.push(pctFact("stock_window", `Change in ${f.company.name}'s share price over the last ${days}`, f.window.stock.return));
  out.push(pctFact("sector_window", `Change in the ${f.sectorName} over the same ${days}`, f.window.sector.return));
  out.push(pctFact("market_window", `Change in the ${f.marketName} over the same ${days}`, f.window.market.return));
  const gap = f.window.stock.return - f.window.sector.return;
  out.push({
    id: COMPUTED_IDS.stock_vs_sector,
    key: "stock_vs_sector",
    label: `How far ${f.company.name}'s move differed from its sector index over the same ${days}`,
    value: Number((gap * 100).toFixed(1)),
    unit: "percentage points",
    display: `${formatNumber(Math.abs(gap * 100), 1)} percentage points`,
    direction: direction(gap),
  });
  // Only bonus issues and splits change the quoted price mechanically; dividends are not adjusted.
  const priceActions = f.actionsInWindow.filter((a) => a.shareMultiplier !== null);
  if (priceActions.length > 0) {
    out.push(
      pctFact(
        "raw_window",
        `Change in the quoted share price over the same ${days}, before adjusting for the ${priceActions.map((a) => (a.type === "bonus" ? "bonus issue" : "stock split")).join(" and ")}`,
        f.window.stockRaw.return,
      ),
    );
  }
  const last = f.raw.points.at(-1)!;
  out.push(textFact("last_close", `Last closing share price (${formatDate(last.date)})`, last.close, "₹", formatRupees(last.close, { decimals: 2 })));

  const periodLabels: [ComputedKey, keyof ScenarioFacts["periods"]["stock"], string][] = [
    ["ret_1w", "1W", "1 week"],
    ["ret_1m", "1M", "1 month"],
    ["ret_6m", "6M", "6 months"],
    ["ret_1y", "1Y", "1 year"],
    ["ret_3y", "3Y", "3 years"],
  ];
  for (const [key, period, words] of periodLabels) {
    const v = f.periods.stock[period];
    if (v !== null) out.push(pctFact(key, `Change in share price over the last ${words}`, v));
  }
  const sec1m = f.periods.sector["1M"];
  const mkt1m = f.periods.market["1M"];
  if (sec1m !== null) out.push(pctFact("sector_1m", `Change in the ${f.sectorName} over the last 1 month`, sec1m));
  if (mkt1m !== null) out.push(pctFact("market_1m", `Change in the ${f.marketName} over the last 1 month`, mkt1m));

  const yearAgo = f.adjusted.points.filter((p) => daysBetween(p.date, f.asOf) <= 365);
  if (yearAgo.length > 0) {
    const closes = yearAgo.map((p) => p.close);
    out.push(textFact("high_52w", "Highest closing price in the last 52 weeks (adjusted for bonus issues and splits)", Math.max(...closes), "₹", formatRupees(Math.max(...closes), { decimals: 2 })));
    out.push(textFact("low_52w", "Lowest closing price in the last 52 weeks (adjusted for bonus issues and splits)", Math.min(...closes), "₹", formatRupees(Math.min(...closes), { decimals: 2 })));
  }

  const r = f.risk;
  const years = Math.round(daysBetween(r.from, r.to) / 365);
  out.push(textFact("history_years", "Length of price history used for the risk figures", years, "years", `${years} years`));
  out.push(pctFact("volatility", "How much the price typically swings in a year (annualised volatility)", r.annualisedVol));
  out.push(pctFact("max_drawdown", `Biggest fall from a high in the last ${years} years`, r.maxDrawdown.depth));
  out.push(
    textFact(
      "max_drawdown_dates",
      "When that biggest fall happened (from the high to the low)",
      `${r.maxDrawdown.peakDate}/${r.maxDrawdown.troughDate}`,
      "dates",
      `${formatDate(r.maxDrawdown.peakDate)} to ${formatDate(r.maxDrawdown.troughDate)}`,
    ),
  );
  if (r.worstMonth) {
    out.push(pctFact("worst_month", `Worst calendar month in the last ${years} years`, r.worstMonth.return));
    out.push(textFact("worst_month_name", "Which month that was", r.worstMonth.month, "month", monthLabel(r.worstMonth.month)));
  }
  if (r.typicalBadMonth !== null) {
    out.push(pctFact("typical_bad_month", "A typical bad month: only 1 month in 10 was worse than this", r.typicalBadMonth));
  }
  out.push(
    textFact(
      "rolling_fall_share",
      "Share of 6-month periods that included a fall of 15% or more from a high",
      Number((r.rollingFalls.share * 100).toFixed(0)),
      "%",
      formatPercent(r.rollingFalls.share, { decimals: 0 }),
    ),
  );

  const ru = f.rupees;
  out.push(textFact("rupee_amount", "Example amount used for the rupee figures", ru.amount, "₹", formatRupees(ru.amount)));
  if (ru.typicalBadMonth !== null) out.push(rupeeFact("rupee_typical_bad_month", `What a typical bad month would mean for ${formatRupees(ru.amount)}`, ru.typicalBadMonth));
  if (ru.worstMonth !== null) out.push(rupeeFact("rupee_worst_month", `What its worst month would mean for ${formatRupees(ru.amount)}`, ru.worstMonth));
  out.push(rupeeFact("rupee_biggest_fall", `What its biggest fall would mean for ${formatRupees(ru.amount)}`, ru.biggestFall));

  out.push(textFact("spike_weeks", `Earlier weeks with a rise of 10% or more that have a full month of history after them (last ${years} years)`, f.spikes.counted, "weeks", String(f.spikes.counted)));
  if (f.spikes.counted > 0) {
    out.push(textFact("spike_weeks_positive", "Of those weeks, how many were followed by a higher price one month later", f.spikes.positive, "weeks", String(f.spikes.positive)));
  }
  out.push(textFact("drawdown_count", `Separate falls of 10% or more from a high (last ${years} years)`, f.drawdowns.length, "falls", String(f.drawdowns.length)));
  const latest = f.drawdowns.at(-1);
  if (latest) {
    const recovered = latest.recoveredDate !== null && latest.sessionsTroughToRecovery !== null;
    out.push(
      textFact(
        "drawdown_latest",
        `Most recent fall of 10% or more: ${formatPercent(Math.abs(latest.depth))} from the ${formatDate(latest.peakDate)} high`,
        recovered ? latest.sessionsTroughToRecovery! : "not recovered",
        recovered ? "trading days from the low back to the high" : "status",
        recovered ? `${latest.sessionsTroughToRecovery} trading days to get back to the high` : "has not got back to the high yet",
      ),
    );
  }
  return out;
}

export function fundamentalsFacts(companyId: string): PackFundamental[] {
  const f = getFundamentals(companyId);
  return FUNDAMENTAL_FIELDS.map((field) => {
    const meta = FUNDAMENTAL_META[field];
    const value = f[field];
    const naReason = f.notApplicable?.[field];
    if (value === null) {
      return {
        id: FUNDAMENTAL_IDS[field],
        label: meta.label,
        value: null,
        unit: meta.unit,
        display: naReason ?? "Not available",
        status: naReason ? "not_applicable" : "missing",
      };
    }
    let display: string;
    if (meta.kind === "pct") display = formatPercent((value as number) / 100);
    else if (meta.kind === "ratio") display = formatNumber(value as number, value as number >= 10 ? 1 : 2);
    else if (meta.kind === "date") display = formatDate(value as string);
    else display = `${formatRupees(value as number, { decimals: (value as number) < 100 ? 1 : 0 })} crore`;
    return { id: FUNDAMENTAL_IDS[field], label: meta.label, value, unit: meta.unit, display, status: "ok" };
  });
}

export function buildContextPack(scenarioId: string, opts: { feed?: "unavailable" } = {}): ContextPack | UnavailablePack {
  const f = computeScenarioFacts(scenarioId);
  if (f.dataStatus.status === "unavailable" || opts.feed === "unavailable") {
    return { unavailable: true, scenarioId, companyId: f.company.id, asOf: f.asOf };
  }
  const siblings = (f.company.siblings ?? []).map((s) => ({ name: getCompany(s.id).name, note: SIBLING_NOTE }));
  const news: PackNews[] = f.news.map((n) => ({
    id: n.id,
    date: n.date,
    ageDays: n.ageDays,
    isStale: n.isStale,
    inWindow: n.inWindow,
    about: n.companyId ? "this company" : n.tags.includes("macro") ? "the whole market" : "its sector",
    sourceName: n.sourceName,
    sourceType: n.sourceType,
    headline: n.headline,
    summary: n.summary,
  }));
  const windowIds = new Set(f.actionsInWindow.map((a) => a.id));
  const corporateActions: PackAction[] = f.actions
    .filter((a) => a.exDate <= f.asOf && daysBetween(a.exDate, f.asOf) <= 400)
    .map((a) => ({
      id: a.id,
      type: a.type,
      exDate: a.exDate,
      ageDays: daysBetween(a.exDate, f.asOf),
      inWindow: windowIds.has(a.id),
      details: a.details,
    }));
  return {
    scenarioId,
    companyId: f.company.id,
    company: { name: f.company.name, ticker: f.company.ticker, sector: f.company.sector, description: f.company.description },
    siblings,
    asOf: f.asOf,
    window: { tradingDays: f.scenario.windowDays, from: f.window.stock.from, to: f.window.stock.to },
    attributionLevel: f.attribution.level,
    indexNames: { sector: f.sectorName, market: f.marketName },
    computed: computedFacts(f),
    news,
    fundamentals: fundamentalsFacts(f.company.id),
    corporateActions,
    dataStatus: { id: "S", status: f.dataStatus.status, asOf: f.dataStatus.asOf, ...(f.dataStatus.note ? { note: f.dataStatus.note } : {}) },
  };
}

export function isUnavailable(p: ContextPack | UnavailablePack): p is UnavailablePack {
  return "unavailable" in p;
}

/** Every id a claim may cite. */
export function packIds(p: ContextPack): Set<string> {
  return new Set([
    ...p.computed.map((c) => c.id),
    ...p.news.map((n) => n.id),
    ...p.fundamentals.map((d) => d.id),
    ...p.corporateActions.map((a) => a.id),
    p.dataStatus.id,
  ]);
}

/** Compact JSON with sorted keys, so the same pack always serialises to the same bytes. */
export function serialisePack(p: ContextPack): string {
  return JSON.stringify(sortKeys(p));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}
