import { z } from "zod";

// zod schemas for every file in /data. tests/data/files.test.ts parses each
// committed file against these, so a malformed fixture fails CI rather than
// failing on screen.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const AttributionLevel = z.enum(["CLEAR", "PARTIAL", "MARKET_WIDE", "SECTOR_WIDE", "UNCLEAR"]);
export type AttributionLevel = z.infer<typeof AttributionLevel>;

export const Company = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    ticker: z.string().regex(/^[A-Z]{3,12}$/),
    name: z.string().min(1),
    sector: z.string().min(1),
    sectorIndexId: z.string().regex(/^idx-[a-z0-9-]+$/),
    description: z.string().min(1),
    isFictional: z.literal(true),
    siblings: z
      .array(z.object({ id: z.string(), relation: z.string().min(1) }).strict())
      .optional(),
  })
  .strict();
export type Company = z.infer<typeof Company>;
export const CompaniesFile = z.array(Company);

export const IndexMeta = z
  .object({
    id: z.string().regex(/^idx-[a-z0-9-]+$/),
    name: z.string().min(1),
    kind: z.enum(["market", "sector"]),
    isSimulated: z.literal(true),
  })
  .strict();
export type IndexMeta = z.infer<typeof IndexMeta>;
export const IndicesFile = z.array(IndexMeta);

export const PriceFile = z
  .object({
    id: z.string(),
    currency: z.literal("INR"),
    /** Raw closes. Bonus/split adjustment happens in lib/compute, never in the file. */
    adjusted: z.literal(false),
    closes: z.array(z.object({ date: isoDate, close: z.number().positive() }).strict()).min(1),
  })
  .strict();
export type PriceFile = z.infer<typeof PriceFile>;

const NEWS_TAG =
  /^(company_event|routine|disclosure|clarification|price_commentary|macro|temporary_event|corporate_action|injection_test|sector:idx-[a-z0-9-]+|conflict:[a-z0-9-]+)$/;

export const NewsItem = z
  .object({
    id: z.string().regex(/^N\d+$/),
    companyId: z.string().nullable(),
    date: isoDate,
    sourceName: z.string().min(1),
    sourceType: z.enum(["exchange_filing", "news", "company_release"]),
    headline: z.string().min(1),
    summary: z.string().min(1),
    tags: z.array(z.string().regex(NEWS_TAG)),
  })
  .strict();
export type NewsItem = z.infer<typeof NewsItem>;
export const NewsFile = z.array(NewsItem);

const nullableNumber = z.number().nullable();

export const FUNDAMENTAL_FIELDS = [
  "revenueGrowth3y",
  "profitGrowth3y",
  "netMargin",
  "debtToEquity",
  "roe",
  "pe",
  "sectorMedianPe",
  "promoterHoldingPct",
  "promoterPledgePct",
  "lastResultsDate",
  "revenueTtmCr",
  "marketCapCr",
] as const;
export type FundamentalField = (typeof FUNDAMENTAL_FIELDS)[number];

export const Fundamentals = z
  .object({
    companyId: z.string(),
    /** 3-year compound annual growth, in percent. */
    revenueGrowth3y: nullableNumber,
    profitGrowth3y: nullableNumber,
    /** Net profit as % of revenue (total income for banks and insurers). */
    netMargin: nullableNumber,
    debtToEquity: nullableNumber,
    roe: nullableNumber,
    pe: nullableNumber,
    sectorMedianPe: nullableNumber,
    promoterHoldingPct: nullableNumber,
    promoterPledgePct: nullableNumber,
    lastResultsDate: isoDate.nullable(),
    /** Trailing-twelve-month revenue in ₹ crore. */
    revenueTtmCr: nullableNumber,
    /** Market capitalisation at the company's snapshot date, in ₹ crore. */
    marketCapCr: nullableNumber,
    /** Fields that are null because they don't apply (as opposed to missing data), with a plain reason. */
    notApplicable: z.partialRecord(z.enum(FUNDAMENTAL_FIELDS), z.string().min(1)).optional(),
  })
  .strict();
export type Fundamentals = z.infer<typeof Fundamentals>;
export const FundamentalsFile = z.array(Fundamentals);

export const CorporateAction = z
  .object({
    id: z.string().regex(/^A\d+$/),
    companyId: z.string(),
    type: z.enum(["dividend", "split", "bonus"]),
    exDate: isoDate,
    details: z.string().min(1),
    /** For bonus/split: shares held after vs before (1:1 bonus = 2 after / 1 before). Null for dividends. */
    shareMultiplier: z.object({ after: z.number().positive(), before: z.number().positive() }).strict().nullable(),
  })
  .strict();
export type CorporateAction = z.infer<typeof CorporateAction>;
export const CorporateActionsFile = z.array(CorporateAction);

export const DataStatusEntry = z
  .object({
    companyId: z.string(),
    asOf: isoDate,
    status: z.enum(["ok", "delayed", "unavailable"]),
    note: z.string().optional(),
  })
  .strict();
export type DataStatusEntry = z.infer<typeof DataStatusEntry>;
export const DataStatusFile = z.array(DataStatusEntry);

export const Scenario = z
  .object({
    id: z.string().regex(/^S\d{2}$/),
    companyId: z.string(),
    edgeCaseIds: z.array(z.number().int().min(1).max(18)),
    title: z.string().min(1),
    description: z.string().min(1),
    asOf: isoDate,
    /** Length of the move being explained, in trading sessions. */
    windowDays: z.number().int().positive(),
    expectedAttributionLevel: AttributionLevel,
    /** "stock" scenarios open a stock page; "holding" scenarios open the thesis check. */
    surface: z.enum(["stock", "holding"]),
    holding: z
      .object({
        id: z.string(),
        quantity: z.number().int().positive(),
        buyDate: isoDate,
        seededReason: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Scenario = z.infer<typeof Scenario>;
export const ScenariosFile = z.array(Scenario);

export const GlossaryTerm = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    term: z.string().min(1),
    aliases: z.array(z.string()),
    definition: z.string().min(1),
  })
  .strict();
export type GlossaryTerm = z.infer<typeof GlossaryTerm>;
export const GlossaryFile = z.array(GlossaryTerm);

export const ComprehensionQuestion = z
  .object({
    id: z.enum(["q1", "q2", "q3"]),
    kind: z.enum(["what_happened", "main_risk", "cause_certain"]),
    prompt: z.string().min(1),
    options: z.array(z.object({ id: z.string(), text: z.string().min(1) }).strict()).min(3).max(4),
    correctOptionId: z.string(),
  })
  .strict()
  .refine((q) => q.options.some((o) => o.id === q.correctOptionId), "correctOptionId must match an option");
export const ComprehensionSet = z
  .object({ scenarioId: z.string(), questions: z.array(ComprehensionQuestion).length(3) })
  .strict();
export type ComprehensionSet = z.infer<typeof ComprehensionSet>;
export const ComprehensionFile = z.array(ComprehensionSet);
