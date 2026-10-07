import { packIds, type ContextPack } from "@/lib/contextPack/build";
import type { GlossaryTerm } from "@/lib/data/schemas";
import { findEntityIssues } from "@/lib/safety/entities";
import {
  addIsoDate,
  addNumber,
  addText,
  emptyAllowed,
  extractTokens,
  isGrounded,
  isSmallCountingInteger,
  type AllowedSet,
} from "@/lib/safety/numbers";
import { BANNED_PHRASES, CAUSAL_CONNECTORS, HEDGES, findPhrases } from "@/lib/safety/phrases";
import { Brief, BriefWire, CLAIM_SECTIONS, type Claim } from "./schema";

// Deterministic checks on model output (build brief §8). Each rule returns
// { rule, pass, detail } plus the specific issues, so the repair call can be
// told exactly what to fix. V10 is a warning; every other rule must pass.

export type RuleId = "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9" | "V10";
export type Issue = { path: string; message: string };
export type RuleResult = {
  rule: RuleId;
  pass: boolean;
  severity: "error" | "warning";
  skipped?: boolean;
  detail: string;
  issues: Issue[];
};
export type ValidationReport = { pass: boolean; errors: number; warnings: number; results: RuleResult[] };

export type TextField = {
  path: string;
  text: string;
  kind: "headline" | "claim" | "check" | "cannotSay" | "question" | "answer";
  claim?: Claim;
};

export const RULE_NAMES: Record<RuleId, string> = {
  V1: "Schema and section counts",
  V2: "Facts have valid sources",
  V3: "Every number comes from the pack",
  V4: "Stale news is dated",
  V5: "No unhedged causal language",
  V6: "No advice or prediction language",
  V7: "Attribution matches the computed level",
  V8: "No other companies named",
  V9: "Company-specific risks covered",
  V10: "Readability (warning)",
};

function result(rule: RuleId, issues: Issue[], okDetail: string, severity: "error" | "warning" = "error"): RuleResult {
  return {
    rule,
    pass: issues.length === 0,
    severity,
    detail: issues.length === 0 ? okDetail : `${issues.length} issue${issues.length === 1 ? "" : "s"}: ${issues.slice(0, 3).map((i) => i.message).join("; ")}`,
    issues,
  };
}

function skipped(rule: RuleId, why: string): RuleResult {
  return { rule, pass: false, severity: rule === "V10" ? "warning" : "error", skipped: true, detail: `Not run: ${why}`, issues: [] };
}

// ---------- fields and pack text ----------

export function briefFields(b: BriefWire): TextField[] {
  const fields: TextField[] = [{ path: "attribution.headline", text: b.attribution.headline, kind: "headline" }];
  for (const section of CLAIM_SECTIONS) {
    b[section].forEach((claim, i) => fields.push({ path: `${section}[${i}]`, text: claim.text, kind: "claim", claim }));
  }
  b.whatToCheck.forEach((c, i) => {
    fields.push({ path: `whatToCheck[${i}].text`, text: c.text, kind: "check" });
    fields.push({ path: `whatToCheck[${i}].why`, text: c.why, kind: "check" });
  });
  b.cannotSay.forEach((t, i) => fields.push({ path: `cannotSay[${i}]`, text: t, kind: "cannotSay" }));
  b.suggestedQuestions.forEach((t, i) => fields.push({ path: `suggestedQuestions[${i}]`, text: t, kind: "question" }));
  return fields;
}

/** Every string in the pack, joined: used for "does the pack mention this?" checks. */
export function packText(p: ContextPack): string {
  return [
    p.company.name,
    p.company.description,
    p.company.sector,
    p.indexNames.sector,
    p.indexNames.market,
    ...p.siblings.flatMap((s) => [s.name, s.note]),
    ...p.computed.flatMap((c) => [c.label, c.display]),
    ...p.news.flatMap((n) => [n.headline, n.summary, n.sourceName]),
    ...p.fundamentals.flatMap((d) => [d.label, d.display]),
    ...p.corporateActions.map((a) => a.details),
    p.dataStatus.note ?? "",
  ].join("\n");
}

export function allowedFromPack(p: ContextPack): AllowedSet {
  const allowed = emptyAllowed();
  addText(allowed, packText(p));
  for (const iso of [p.asOf, p.window.from, p.window.to, p.dataStatus.asOf]) addIsoDate(allowed, iso);
  for (const n of p.news) addIsoDate(allowed, n.date);
  for (const a of p.corporateActions) addIsoDate(allowed, a.exDate);
  for (const c of p.computed) {
    if (typeof c.value === "number") {
      const family = c.unit === "%" || c.unit === "percentage points" ? "percent" : c.unit === "₹" ? "rupee" : "plain";
      addNumber(allowed, family, c.value);
    } else {
      for (const part of c.value.split("/")) addIsoDate(allowed, part);
    }
  }
  for (const d of p.fundamentals) {
    if (typeof d.value === "number") {
      if (d.unit === "%") addNumber(allowed, "percent", d.value);
      else if (d.unit === "₹ crore") addNumber(allowed, "rupee", d.value * 1e7);
      else addNumber(allowed, "plain", d.value);
    } else if (typeof d.value === "string") {
      addIsoDate(allowed, d.value);
    }
  }
  return allowed;
}

// ---------- individual rules ----------

export function ruleV2(fields: TextField[], pack: ContextPack): RuleResult {
  const ids = packIds(pack);
  const issues: Issue[] = [];
  for (const f of fields) {
    if (!f.claim) continue;
    if (f.claim.type === "FACT" && f.claim.sourceIds.length === 0) {
      issues.push({ path: f.path, message: `FACT "${f.claim.id}" has no sourceIds` });
    }
    for (const id of f.claim.sourceIds) {
      if (!ids.has(id)) issues.push({ path: f.path, message: `"${f.claim.id}" cites ${id}, which is not in the pack` });
    }
  }
  return result("V2", issues, "Every FACT cites at least one source and every cited id exists.");
}

export function ruleV3(fields: TextField[], pack: ContextPack, allowed = allowedFromPack(pack)): RuleResult {
  const issues: Issue[] = [];
  for (const f of fields) {
    for (const t of extractTokens(f.text)) {
      if (isGrounded(t, allowed)) continue;
      if (f.kind === "check" && isSmallCountingInteger(t)) continue;
      issues.push({ path: f.path, message: `"${t.raw}" does not match any value in the pack` });
    }
  }
  return result("V3", issues, "Every number, amount and date matches a pack value.");
}

export function ruleV4(fields: TextField[], pack: ContextPack): RuleResult {
  const issues: Issue[] = [];
  const byId = new Map(pack.news.map((n) => [n.id, n]));
  for (const f of fields) {
    if (!f.claim || f.claim.sourceIds.length === 0) continue;
    const sources = f.claim.sourceIds.map((id) => byId.get(id));
    if (!sources.every((s) => s?.isStale)) continue;
    const dates = new Set(sources.map((s) => s!.date));
    const mentioned = extractTokens(f.text).some((t) => {
      if (t.kind !== "date") return false;
      return [...dates].some((d) => {
        const [y, m, day] = d.split("-").map(Number);
        return t.day === day && t.month === m && (t.year === null || t.year === y);
      });
    });
    if (!mentioned) {
      issues.push({ path: f.path, message: `"${f.claim.id}" rests only on stale news (${[...dates].join(", ")}) but doesn't say when it is from` });
    }
  }
  return result("V4", issues, "No claim relies only on stale news without dating it.");
}

function hasHedge(text: string): boolean {
  return findPhrases(text, HEDGES).length > 0;
}

export function ruleV5(fields: TextField[]): RuleResult {
  const issues: Issue[] = [];
  for (const f of fields) {
    const connectors = findPhrases(f.text, CAUSAL_CONNECTORS);
    if (connectors.length === 0) continue;
    if (f.claim?.type === "FACT") {
      issues.push({ path: f.path, message: `FACT "${f.claim.id}" uses causal language ("${connectors[0]}")` });
    } else if ((f.claim?.type === "INTERPRETATION" || f.kind === "headline") && !hasHedge(f.text)) {
      issues.push({ path: f.path, message: `${f.claim ? `INTERPRETATION "${f.claim.id}"` : "Headline"} uses "${connectors[0]}" without a hedge` });
    }
  }
  return result("V5", issues, "Facts make no causal claims; causal interpretations are hedged.");
}

export function ruleV6(fields: TextField[]): RuleResult {
  const issues: Issue[] = [];
  for (const f of fields) {
    for (const p of findPhrases(f.text, BANNED_PHRASES)) issues.push({ path: f.path, message: `contains "${p}"` });
  }
  return result("V6", issues, "No advice or prediction language.");
}

export function ruleV7(level: string, fields: TextField[], pack: ContextPack): RuleResult {
  const issues: Issue[] = [];
  if (level !== pack.attributionLevel) {
    issues.push({ path: "attribution.level", message: `level is ${level} but the computed level is ${pack.attributionLevel}` });
  }
  if (pack.attributionLevel === "UNCLEAR") {
    for (const f of fields) {
      if (!f.claim && f.kind !== "headline") continue;
      const connectors = findPhrases(f.text, CAUSAL_CONNECTORS);
      if (connectors.length === 0) continue;
      if (f.claim?.type === "UNCERTAIN" || hasHedge(f.text)) continue;
      issues.push({ path: f.path, message: `states a cause ("${connectors[0]}") although no clear reason was found` });
    }
  }
  return result("V7", issues, `Level matches the computed ${pack.attributionLevel}.`);
}

export function ruleV8(fields: TextField[], pack: ContextPack, text = packText(pack)): RuleResult {
  const ctx = { subjectName: pack.company.name, siblingNames: pack.siblings.map((s) => s.name), packText: text };
  const issues: Issue[] = [];
  for (const f of fields) {
    for (const e of findEntityIssues(f.text, ctx)) {
      const why =
        e.reason === "sibling_without_note"
          ? `names ${e.name} without saying it is a different company`
          : e.reason === "real_entity"
            ? `names ${e.name}, which is not in the pack`
            : `names another company (${e.name})`;
      issues.push({ path: f.path, message: why });
    }
  }
  return result("V8", issues, "Only the subject company is named (siblings only as a different company).");
}

export function ruleV9(b: BriefWire, pack: ContextPack): RuleResult {
  const issues: Issue[] = [];
  const ids = packIds(pack);
  if (b.whatCouldGoWrong.length < 2) issues.push({ path: "whatCouldGoWrong", message: "fewer than 2 risks" });
  const specific = b.whatCouldGoWrong.some((c) => c.sourceIds.some((id) => /^[ND]\d+$/.test(id) && ids.has(id)));
  if (!specific) issues.push({ path: "whatCouldGoWrong", message: "no risk cites a news (N) or fundamentals (D) source" });
  return result("V9", issues, "At least 2 risks, at least 1 specific to this company.");
}

const EVERYDAY_TERMS = new Set([
  "share", "stock", "stock exchange", "index", "sector index", "revenue", "net profit", "quarterly results",
  "trading session", "dividend", "promoter",
]);
const EXPLANATION_CUE = /\(|—| – | - |\bwhich means\b|\bmeans\b|\bmeaning\b|\bis when\b|\bis the\b|\bare the\b|\bthat is\b|\bi\.e\.|\bshows how\b|\bmeasures\b|\bcompares\b/i;

export function ruleV10(fields: TextField[], glossary: readonly GlossaryTerm[]): RuleResult {
  const issues: Issue[] = [];
  for (const f of fields) {
    const words = f.text.trim().split(/\s+/).filter(Boolean).length;
    if (f.claim && words > 30) issues.push({ path: f.path, message: `claim "${f.claim.id}" has ${words} words (max 30)` });
    if (f.kind === "headline" && words > 12) issues.push({ path: f.path, message: `headline has ${words} words (max 12)` });
  }
  const seen = new Set<string>();
  for (const f of fields) {
    for (const g of glossary) {
      if (seen.has(g.id) || EVERYDAY_TERMS.has(g.term.toLowerCase())) continue;
      const names = [g.term, ...g.aliases].filter((n) => n.length >= 2);
      const sentence = f.text.split(/(?<=[.!?])\s+/).find((s) =>
        names.some((n) => new RegExp(`(?<![A-Za-z])${n.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![A-Za-z])`, "i").test(s)),
      );
      if (!sentence) continue;
      seen.add(g.id);
      if (!EXPLANATION_CUE.test(sentence)) issues.push({ path: f.path, message: `"${g.term}" is used without an explanation the first time` });
    }
  }
  return result("V10", issues, "Claims are short and jargon is explained.", "warning");
}

// ---------- whole-brief validation ----------

export type BriefValidation = ValidationReport & { brief: BriefWire | null };

export function summarise(results: RuleResult[]): ValidationReport {
  const errors = results.filter((r) => !r.pass && r.severity === "error").length;
  const warnings = results.filter((r) => !r.pass && r.severity === "warning").length;
  return { pass: errors === 0, errors, warnings, results };
}

export function validateBrief(raw: unknown, pack: ContextPack, glossary: readonly GlossaryTerm[]): BriefValidation {
  const wire = BriefWire.safeParse(raw);
  if (!wire.success) {
    const v1: RuleResult = {
      rule: "V1",
      pass: false,
      severity: "error",
      detail: "Output does not match the brief schema.",
      issues: wire.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })),
    };
    const rest = (["V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10"] as RuleId[]).map((r) => skipped(r, "schema invalid"));
    return { ...summarise([v1, ...rest]), brief: null };
  }
  const b = wire.data;
  const v1Issues: Issue[] = [];
  const strict = Brief.safeParse(b);
  if (!strict.success) {
    for (const i of strict.error.issues) v1Issues.push({ path: i.path.join("."), message: i.message });
  }
  if (b.companyId !== pack.companyId) v1Issues.push({ path: "companyId", message: `expected ${pack.companyId}` });
  if (b.scenarioId !== pack.scenarioId) v1Issues.push({ path: "scenarioId", message: `expected ${pack.scenarioId}` });
  if (b.asOf !== pack.asOf) v1Issues.push({ path: "asOf", message: `expected ${pack.asOf}` });
  const claimIds = CLAIM_SECTIONS.flatMap((s) => b[s].map((c) => c.id));
  const dupes = claimIds.filter((id, i) => claimIds.indexOf(id) !== i);
  if (dupes.length) v1Issues.push({ path: "claims", message: `duplicate claim ids: ${[...new Set(dupes)].join(", ")}` });

  const fields = briefFields(b);
  const text = packText(pack);
  const results: RuleResult[] = [
    result("V1", v1Issues, "Schema valid; section counts within range."),
    ruleV2(fields, pack),
    ruleV3(fields, pack),
    ruleV4(fields, pack),
    ruleV5(fields),
    ruleV6(fields),
    ruleV7(b.attribution.level, fields, pack),
    ruleV8(fields, pack, text),
    ruleV9(b, pack),
    ruleV10(fields, glossary),
  ];
  return { ...summarise(results), brief: b };
}

/** Rules reused for Ask answers and other short outputs (build brief §9). */
export function validateAnswerFields(fields: TextField[], pack: ContextPack): ValidationReport {
  return summarise([ruleV2(fields, pack), ruleV3(fields, pack), ruleV5(fields), ruleV6(fields), ruleV8(fields, pack)]);
}

/** Failing error-rule issues formatted for the repair prompt. */
export function repairNotes(report: ValidationReport): string {
  return report.results
    .filter((r) => !r.pass && r.severity === "error" && !r.skipped)
    .map((r) => `${r.rule} ${RULE_NAMES[r.rule]}:\n${(r.issues.length ? r.issues : [{ path: "", message: r.detail }]).map((i) => `  - ${i.path ? `${i.path}: ` : ""}${i.message}`).join("\n")}`)
    .join("\n");
}
