// Every threshold the deterministic layers depend on lives here, so a reviewer
// can see (and change) them in one place. Returns are fractions (0.07 = 7%).

export const SNAPSHOT = {
  /** Shared snapshot for S01–S14. */
  T0: "2026-07-24",
  /** "Three weeks later" snapshot for the S15 thesis check. */
  T1: "2026-08-14",
} as const;

export const ATTRIBUTION = {
  /** A move is "close to" another if within max(closeAbs, closeRel × |stock move|). */
  closeAbs: 0.015,
  closeRel: 0.25,
  /** CLEAR needs |residual| ≥ clearResidual AND |residual| / |stock move| ≥ clearShare. */
  clearResidual: 0.03,
  clearShare: 0.5,
  /** Only news carrying this tag can count as a company-specific reason. */
  qualifyingTag: "company_event",
  /** News sharing a tag with this prefix contradict each other; caps the level at PARTIAL. */
  conflictTagPrefix: "conflict:",
} as const;

export const FRESHNESS = {
  /** News older than this many calendar days (relative to asOf) is stale. */
  staleAfterDays: 30,
} as const;

export const PACK_NEWS = {
  /** Company news up to this old is included in a context pack (stale items included, flagged). */
  companyLookbackDays: 180,
  /** Sector news (tag sector:<indexId>) up to this old is included. */
  sectorLookbackDays: 30,
} as const;

/** Calendar look-back periods for the stock-page returns row (brokerage convention). */
export const PERIODS = [
  { key: "1D", sessions: 1 },
  { key: "1W", days: 7 },
  { key: "1M", months: 1 },
  { key: "6M", months: 6 },
  { key: "1Y", months: 12 },
  { key: "3Y", months: 36 },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export const RISK = {
  tradingDaysPerYear: 252,
  /** Risk history uses the trailing N calendar years up to asOf. */
  historyYears: 3,
  /** Rolling window (in sessions) for the "share of 6-month windows with a 15% fall" stat. */
  rollingWindowSessions: 126,
  rollingFallThreshold: 0.15,
  /** "A typical bad month" = this percentile of calendar-month returns. */
  typicalBadMonthPercentile: 0.1,
} as const;

export const DRAWDOWNS = {
  /** A drawdown episode starts when the price is this far below its running peak. */
  threshold: 0.1,
} as const;

export const SPIKES = {
  /** A week (Friday close to Friday close) with a rise of at least this much is a spike. */
  weeklyRiseThreshold: 0.1,
  /** Follow-through horizon after a spike week, in sessions (about one month). */
  followThroughSessions: 21,
} as const;

export const RUPEES = {
  defaultAmount: 5000,
  /** Rupee risk figures are rounded to the nearest multiple of this. */
  roundTo: 10,
} as const;
