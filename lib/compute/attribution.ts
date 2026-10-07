import { ATTRIBUTION, FRESHNESS } from "@/lib/config";
import type { AttributionLevel, NewsItem } from "@/lib/data/schemas";
import { daysBetween } from "./dates";
import { decomposeMove, type MoveDecomposition } from "./decompose";

// Deterministic attribution level for a window move (PLAN.md §5). The LLM never
// picks the level; it only explains the one computed here.

export type NewsLike = Pick<NewsItem, "id" | "companyId" | "date" | "tags">;

export type AttributionConfig = {
  readonly closeAbs: number;
  readonly closeRel: number;
  readonly clearResidual: number;
  readonly clearShare: number;
  readonly qualifyingTag: string;
  readonly conflictTagPrefix: string;
};

/**
 * Slack for comparisons, so a value that is "exactly at" a threshold in decimal
 * (0.08 − 0.06 vs 0.02) is not pushed across it by binary rounding.
 */
const EPS = 1e-12;

/**
 * News that can count as a company-specific reason for the move: this company's
 * `company_event` items dated after the window's base day, up to and including
 * its last day, and at most `staleAfterDays` old at the window's end.
 */
export function qualifyingNews<T extends NewsLike>(
  news: readonly T[],
  companyId: string,
  window: { from: string; to: string },
  staleAfterDays: number = FRESHNESS.staleAfterDays,
): T[] {
  return news.filter(
    (n) =>
      n.companyId === companyId &&
      n.tags.includes(ATTRIBUTION.qualifyingTag) &&
      n.date > window.from &&
      n.date <= window.to &&
      daysBetween(n.date, window.to) <= staleAfterDays,
  );
}

export type AttributionRule = "market_close" | "sector_close" | "clear" | "partial" | "partial_conflict" | "no_news";

export type AttributionResult = {
  level: AttributionLevel;
  rule: AttributionRule;
  decomposition: MoveDecomposition;
  qualifyingNewsIds: string[];
  /** Two or more qualifying items share a conflict tag. Reported whichever rule decided the level. */
  hasConflict: boolean;
};

/** True when at least two distinct items carry the same tag starting with `prefix`. */
function hasConflictingNews(news: readonly NewsLike[], prefix: string): boolean {
  const seen = new Set<string>();
  for (const item of news) {
    for (const tag of new Set(item.tags)) {
      if (!tag.startsWith(prefix)) continue;
      if (seen.has(tag)) return true;
      seen.add(tag);
    }
  }
  return false;
}

/**
 * Rules, in order (tol = max(closeAbs, closeRel × |stock|)):
 * 1. stock within tol of the market → MARKET_WIDE
 * 2. stock within tol of its sector → SECTOR_WIDE
 * 3. no qualifying news → UNCLEAR
 * 4. qualifying news conflict → PARTIAL
 * 5. |residual| ≥ clearResidual and ≥ clearShare × |stock| → CLEAR, else PARTIAL
 *
 * `qualifyingNews` must already be filtered with `qualifyingNews()`.
 */
export function computeAttribution(
  input: { stock: number; sector: number; market: number; qualifyingNews: readonly NewsLike[] },
  cfg: AttributionConfig = ATTRIBUTION,
): AttributionResult {
  const { stock, sector, market } = input;
  const decomposition = decomposeMove(stock, sector, market);
  const qualifyingNewsIds = input.qualifyingNews.map((n) => n.id);
  const hasConflict = hasConflictingNews(input.qualifyingNews, cfg.conflictTagPrefix);
  const result = (level: AttributionLevel, rule: AttributionRule): AttributionResult => ({
    level,
    rule,
    decomposition,
    qualifyingNewsIds,
    hasConflict,
  });

  const tol = Math.max(cfg.closeAbs, cfg.closeRel * Math.abs(stock));
  if (Math.abs(stock - market) <= tol + EPS) return result("MARKET_WIDE", "market_close");
  if (Math.abs(stock - sector) <= tol + EPS) return result("SECTOR_WIDE", "sector_close");
  if (qualifyingNewsIds.length === 0) return result("UNCLEAR", "no_news");
  if (hasConflict) return result("PARTIAL", "partial_conflict");

  const residual = Math.abs(decomposition.residual);
  const isClear = residual >= cfg.clearResidual - EPS && residual >= cfg.clearShare * Math.abs(stock) - EPS;
  return isClear ? result("CLEAR", "clear") : result("PARTIAL", "partial");
}
