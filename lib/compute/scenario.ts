import { FRESHNESS, PACK_NEWS, RUPEES } from "@/lib/config";
import {
  actionsFor,
  getCompany,
  getDataStatus,
  getFundamentals,
  getIndexMeta,
  getScenario,
  indexSeries,
  MARKET_INDEX_ID,
  news as allNews,
  rawPriceSeries,
} from "@/lib/data/load";
import type { AttributionLevel, Company, CorporateAction, DataStatusEntry, NewsItem, Scenario } from "@/lib/data/schemas";
import { computeAttribution, qualifyingNews, type AttributionResult } from "./attribution";
import { actionsInWindow, adjustSeries } from "./corporateActions";
import { daysBetween } from "./dates";
import { drawdownEpisodes, type DrawdownEpisode } from "./drawdowns";
import { newsAge } from "./freshness";
import { periodReturns, windowReturn, type PeriodReturns, type WindowReturn } from "./returns";
import { riskHistory, type RiskHistory } from "./risk";
import { rupeeRisk, type RupeeRisk } from "./rupees";
import { sliceToAsOf, type Series } from "./series";
import { priorSpikes, type SpikeHistory } from "./spikes";
import { valuationContext, type ValuationContext } from "./valuation";

// Everything the deterministic layer knows about one scenario, computed from
// /data only. The context pack (Phase 2) and the UI both read from this, so
// the numbers on screen and the numbers the model sees are the same numbers.

export type DatedNews = NewsItem & { ageDays: number; isStale: boolean; inWindow: boolean };

export type ScenarioFacts = {
  scenario: Scenario;
  company: Company;
  sectorName: string;
  marketName: string;
  asOf: string;
  dataStatus: DataStatusEntry;
  /** Corporate-action-adjusted closes up to asOf (what charts and risk use). */
  adjusted: Series;
  raw: Series;
  sector: Series;
  market: Series;
  window: { stock: WindowReturn; stockRaw: WindowReturn; sector: WindowReturn; market: WindowReturn };
  attribution: AttributionResult;
  periods: { stock: PeriodReturns; sector: PeriodReturns; market: PeriodReturns };
  risk: RiskHistory;
  rupees: RupeeRisk;
  spikes: SpikeHistory;
  drawdowns: DrawdownEpisode[];
  valuation: ValuationContext;
  actions: CorporateAction[];
  actionsInWindow: CorporateAction[];
  /** Company news (lookback PACK_NEWS.companyLookbackDays), sector news and in-window macro news, newest first. */
  news: DatedNews[];
};

function requireWindow(w: WindowReturn | null, what: string, scenarioId: string): WindowReturn {
  if (!w) throw new Error(`${scenarioId}: not enough history for the ${what} window`);
  return w;
}

export function relevantNews(
  companyId: string,
  sectorIndexId: string,
  asOf: string,
  window: { from: string; to: string },
  items: readonly NewsItem[] = allNews,
): DatedNews[] {
  const out: DatedNews[] = [];
  for (const n of items) {
    if (n.date > asOf) continue;
    const age = daysBetween(n.date, asOf);
    const isCompany = n.companyId === companyId;
    const isSector = n.companyId === null && n.tags.includes(`sector:${sectorIndexId}`);
    const inWindow = n.date > window.from && n.date <= window.to;
    const isMacro = n.companyId === null && n.tags.includes("macro");
    const keep =
      (isCompany && age <= PACK_NEWS.companyLookbackDays) ||
      (isSector && age <= PACK_NEWS.sectorLookbackDays) ||
      (isMacro && inWindow);
    if (!keep) continue;
    const { ageDays, isStale } = newsAge(n.date, asOf, FRESHNESS.staleAfterDays);
    out.push({ ...n, ageDays, isStale, inWindow });
  }
  return out.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));
}

export function computeScenarioFacts(scenarioId: string): ScenarioFacts {
  const scenario = getScenario(scenarioId);
  const company = getCompany(scenario.companyId);
  const asOf = scenario.asOf;
  const actions = actionsFor(company.id);

  const raw = sliceToAsOf(rawPriceSeries(company.id), asOf);
  const adjusted = adjustSeries(raw, actions);
  const sector = sliceToAsOf(indexSeries(company.sectorIndexId), asOf);
  const market = sliceToAsOf(indexSeries(MARKET_INDEX_ID), asOf);

  const n = scenario.windowDays;
  const stockW = requireWindow(windowReturn(adjusted, asOf, n), "stock", scenarioId);
  const window = {
    stock: stockW,
    stockRaw: requireWindow(windowReturn(raw, asOf, n), "raw stock", scenarioId),
    sector: requireWindow(windowReturn(sector, asOf, n), "sector", scenarioId),
    market: requireWindow(windowReturn(market, asOf, n), "market", scenarioId),
  };
  const span = { from: stockW.from, to: stockW.to };

  const news = relevantNews(company.id, company.sectorIndexId, asOf, span);
  const attribution = computeAttribution({
    stock: window.stock.return,
    sector: window.sector.return,
    market: window.market.return,
    qualifyingNews: qualifyingNews(news, company.id, span),
  });

  const risk = riskHistory(adjusted, asOf);
  return {
    scenario,
    company,
    sectorName: getIndexMeta(company.sectorIndexId).name,
    marketName: getIndexMeta(MARKET_INDEX_ID).name,
    asOf,
    dataStatus: getDataStatus(company.id),
    adjusted,
    raw,
    sector,
    market,
    window,
    attribution,
    periods: {
      stock: periodReturns(adjusted, asOf),
      sector: periodReturns(sector, asOf),
      market: periodReturns(market, asOf),
    },
    risk,
    rupees: rupeeRisk(RUPEES.defaultAmount, risk),
    spikes: priorSpikes(adjusted, asOf, { excludeFrom: span.from }),
    drawdowns: drawdownEpisodes(adjusted, asOf, { from: risk.from }),
    valuation: valuationContext(getFundamentals(company.id)),
    actions,
    actionsInWindow: actionsInWindow(actions, span),
    news,
  };
}

export function expectedLevel(scenarioId: string): AttributionLevel {
  return getScenario(scenarioId).expectedAttributionLevel;
}
