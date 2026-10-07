import companiesJson from "@/data/companies.json";
import indicesJson from "@/data/indices.json";
import newsJson from "@/data/news.json";
import fundamentalsJson from "@/data/fundamentals.json";
import corporateActionsJson from "@/data/corporateActions.json";
import dataStatusJson from "@/data/dataStatus.json";
import scenariosJson from "@/data/scenarios.json";
import glossaryJson from "@/data/glossary.json";
import comprehensionJson from "@/data/comprehension.json";
import { PRICE_FILES, INDEX_FILES } from "./seriesRegistry";
import {
  CompaniesFile,
  ComprehensionFile,
  CorporateActionsFile,
  DataStatusFile,
  FundamentalsFile,
  GlossaryFile,
  IndicesFile,
  NewsFile,
  PriceFile,
  ScenariosFile,
  type Company,
  type CorporateAction,
  type DataStatusEntry,
  type Fundamentals,
  type IndexMeta,
  type NewsItem,
  type Scenario,
} from "./schemas";
import type { Series } from "@/lib/compute/series";

// Typed, validated access to /data. Files are imported statically so they are
// bundled for serverless functions. Parsing happens once per process.

export const companies = CompaniesFile.parse(companiesJson);
export const indices = IndicesFile.parse(indicesJson);
export const news = NewsFile.parse(newsJson);
export const fundamentals = FundamentalsFile.parse(fundamentalsJson);
export const corporateActions = CorporateActionsFile.parse(corporateActionsJson);
export const dataStatus = DataStatusFile.parse(dataStatusJson);
export const scenarios = ScenariosFile.parse(scenariosJson);
export const glossary = GlossaryFile.parse(glossaryJson);
export const comprehension = ComprehensionFile.parse(comprehensionJson);

export const MARKET_INDEX_ID = "idx-market";

function byId<T extends { id: string }>(items: readonly T[], id: string, kind: string): T {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown ${kind}: ${id}`);
  return found;
}

export function getCompany(id: string): Company {
  return byId(companies, id, "company");
}

export function findCompany(id: string): Company | undefined {
  return companies.find((c) => c.id === id);
}

export function getScenario(id: string): Scenario {
  return byId(scenarios, id, "scenario");
}

export function getIndexMeta(id: string): IndexMeta {
  return byId(indices, id, "index");
}

/** The stock-surface scenario a company opens with (S02 for Coastline; S15 is the holding view). */
export function defaultScenarioFor(companyId: string): Scenario {
  const s = scenarios.find((x) => x.companyId === companyId && x.surface === "stock");
  if (!s) throw new Error(`No stock scenario for ${companyId}`);
  return s;
}

export function getFundamentals(companyId: string): Fundamentals {
  const f = fundamentals.find((x) => x.companyId === companyId);
  if (!f) throw new Error(`No fundamentals for ${companyId}`);
  return f;
}

export function getDataStatus(companyId: string): DataStatusEntry {
  const s = dataStatus.find((x) => x.companyId === companyId);
  if (!s) throw new Error(`No data status for ${companyId}`);
  return s;
}

export function newsFor(companyId: string): NewsItem[] {
  return news.filter((n) => n.companyId === companyId);
}

export function actionsFor(companyId: string): CorporateAction[] {
  return corporateActions.filter((a) => a.companyId === companyId);
}

const parsedSeries = new Map<string, Series>();

function toSeries(id: string, raw: unknown): Series {
  const cached = parsedSeries.get(id);
  if (cached) return cached;
  const file = PriceFile.parse(raw);
  const series = { id, points: file.closes };
  parsedSeries.set(id, series);
  return series;
}

/** Raw (unadjusted) closes for a company. */
export function rawPriceSeries(companyId: string): Series {
  const c = getCompany(companyId);
  const raw = PRICE_FILES[c.ticker];
  if (!raw) throw new Error(`No price file for ${c.ticker}`);
  return toSeries(c.ticker, raw);
}

export function indexSeries(indexId: string): Series {
  const raw = INDEX_FILES[indexId];
  if (!raw) throw new Error(`No index file for ${indexId}`);
  return toSeries(indexId, raw);
}
