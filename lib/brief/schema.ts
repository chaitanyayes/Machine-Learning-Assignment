import { z } from "zod";
import { AttributionLevel } from "@/lib/data/schemas";

// The Decision Brief contract (build brief §7). Two forms:
// - BriefWire: the structural shape sent to the API as the JSON schema. It has
//   no count limits, so a brief with the wrong number of items still parses
//   and reaches the validator, which feeds the problem into the repair call.
// - Brief: the strict shape, with section counts. V1 checks it.

export const ClaimType = z.enum(["FACT", "INTERPRETATION", "UNCERTAIN"]);
export type ClaimType = z.infer<typeof ClaimType>;

export const Claim = z
  .object({
    id: z.string(),
    text: z.string(),
    type: ClaimType,
    sourceIds: z.array(z.string()),
  })
  .strict();
export type Claim = z.infer<typeof Claim>;

const CheckItem = z.object({ text: z.string(), why: z.string() }).strict();

export const BriefWire = z
  .object({
    companyId: z.string(),
    scenarioId: z.string(),
    asOf: z.string(),
    attribution: z.object({ level: AttributionLevel, headline: z.string() }).strict(),
    whatHappened: z.array(Claim),
    whatItMightMean: z.array(Claim),
    whatCouldGoWrong: z.array(Claim),
    whatToCheck: z.array(CheckItem),
    conflicts: z.array(Claim),
    cannotSay: z.array(z.string()),
    suggestedQuestions: z.array(z.string()),
  })
  .strict();
export type BriefWire = z.infer<typeof BriefWire>;

export const SECTION_COUNTS = {
  whatHappened: { min: 2, max: 4 },
  whatItMightMean: { min: 1, max: 3 },
  whatCouldGoWrong: { min: 2, max: 4 },
  whatToCheck: { min: 3, max: 5 },
  conflicts: { min: 0, max: 4 },
  cannotSay: { min: 1, max: 3 },
  suggestedQuestions: { min: 3, max: 3 },
} as const;

const counted = <T extends z.ZodTypeAny>(item: T, key: keyof typeof SECTION_COUNTS) =>
  z.array(item).min(SECTION_COUNTS[key].min).max(SECTION_COUNTS[key].max);

export const Brief = z
  .object({
    companyId: z.string().min(1),
    scenarioId: z.string().min(1),
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    attribution: z.object({ level: AttributionLevel, headline: z.string().min(1) }).strict(),
    whatHappened: counted(Claim, "whatHappened"),
    whatItMightMean: counted(Claim, "whatItMightMean"),
    whatCouldGoWrong: counted(Claim, "whatCouldGoWrong"),
    whatToCheck: counted(CheckItem, "whatToCheck"),
    conflicts: counted(Claim, "conflicts"),
    cannotSay: counted(z.string().min(1), "cannotSay"),
    suggestedQuestions: counted(z.string().min(1), "suggestedQuestions"),
  })
  .strict();
export type Brief = z.infer<typeof Brief>;

export const CLAIM_SECTIONS = ["whatHappened", "whatItMightMean", "whatCouldGoWrong", "conflicts"] as const;
export type ClaimSection = (typeof CLAIM_SECTIONS)[number];

export function allClaims(b: Pick<BriefWire, ClaimSection>): { section: ClaimSection; claim: Claim }[] {
  return CLAIM_SECTIONS.flatMap((section) => b[section].map((claim) => ({ section, claim })));
}
