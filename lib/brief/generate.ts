import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { buildContextPack, isUnavailable, serialisePack, type ContextPack } from "@/lib/contextPack/build";
import type { GlossaryTerm } from "@/lib/data/schemas";
import type { LlmCaller, LlmResponse } from "@/lib/llm/client";
import { FALLBACK_NOTICE, fallbackBrief } from "./fallback";
import { BriefWire } from "./schema";
import { repairNotes, validateBrief, type ValidationReport } from "./validate";

// Pipeline (build brief §7): context pack → model (JSON only) → parse →
// validate → at most ONE repair call with the validator's findings →
// deterministic fallback if it still fails. Every attempt is recorded so the
// Reviewer panel and the cached files show exactly what happened.

export type Attempt = {
  kind: "initial" | "repair";
  stopReason: string | null;
  servedModel: string | null;
  usage?: LlmResponse["usage"];
  rawText: string | null;
  error?: string;
  validation: ValidationReport | null;
};

export type GeneratedBrief = {
  scenarioId: string;
  brief: BriefWire;
  validation: ValidationReport;
  attempts: Attempt[];
  fallbackUsed: boolean;
  fallbackReason?: string;
  notice?: string;
  requestedModel: string | null;
  servedModel: string | null;
  generatedAt: string;
  packHash: string;
};

export type UnavailableBrief = { scenarioId: string; unavailable: true };

export const BRIEF_FORMAT = zodOutputFormat(BriefWire);

export type GenerateDeps = {
  llm: LlmCaller | null;
  systemPrompt: string;
  glossary: readonly GlossaryTerm[];
  now: () => string;
  serverFallback: boolean;
  requestedModel: string | null;
  log?: (message: string) => void;
};

/** Small, stable fingerprint of the pack so a cached brief can be checked against current data. */
export function packHash(pack: ContextPack): string {
  const s = serialisePack(pack);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function userMessage(pack: ContextPack): string {
  return [
    "CONTEXT PACK:",
    serialisePack(pack),
    "",
    `Write the Decision Brief for scenario ${pack.scenarioId}. Set companyId to "${pack.companyId}", scenarioId to "${pack.scenarioId}" and asOf to "${pack.asOf}". Give every claim a short unique id such as "h1", "m1", "r1", "c1".`,
  ].join("\n");
}

export function repairMessage(report: ValidationReport): string {
  return [
    "Your brief failed these automatic checks:",
    repairNotes(report),
    "",
    "Return the full corrected brief as JSON. Fix every problem listed. Keep everything else the same, follow all the original rules, and use only the context pack.",
  ].join("\n");
}

function parseJson(text: string | null): { value: unknown; error?: string } {
  if (text === null) return { value: null, error: "no text in the response" };
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    return { value: null, error: `invalid JSON: ${(e as Error).message}` };
  }
}

async function attempt(
  deps: GenerateDeps,
  pack: ContextPack,
  kind: Attempt["kind"],
  messages: Anthropic.MessageParam[],
): Promise<{ record: Attempt; brief: BriefWire | null }> {
  try {
    const res = await deps.llm!({
      purpose: kind === "initial" ? "brief" : "brief-repair",
      system: deps.systemPrompt,
      messages,
      maxTokens: 16000,
      effort: "medium",
      format: BRIEF_FORMAT,
      serverFallback: deps.serverFallback,
    });
    const base = { kind, stopReason: res.stopReason, servedModel: res.servedModel, usage: res.usage, rawText: res.text };
    if (res.stopReason === "refusal" || res.stopReason === "max_tokens") {
      return { record: { ...base, error: `stopped: ${res.stopReason}`, validation: null }, brief: null };
    }
    const parsed = parseJson(res.text);
    if (parsed.error) return { record: { ...base, error: parsed.error, validation: null }, brief: null };
    const v = validateBrief(parsed.value, pack, deps.glossary);
    const { brief, ...validation } = v;
    return { record: { ...base, validation }, brief };
  } catch (e) {
    return {
      record: { kind, stopReason: null, servedModel: null, rawText: null, error: (e as Error).message, validation: null },
      brief: null,
    };
  }
}

export async function generateBriefForPack(pack: ContextPack, deps: GenerateDeps): Promise<GeneratedBrief> {
  const attempts: Attempt[] = [];
  const done = (brief: BriefWire, validation: ValidationReport, fallback?: string): GeneratedBrief => {
    const last = attempts.at(-1);
    return {
      scenarioId: pack.scenarioId,
      brief,
      validation,
      attempts,
      fallbackUsed: fallback !== undefined,
      ...(fallback !== undefined ? { fallbackReason: fallback, notice: FALLBACK_NOTICE } : {}),
      requestedModel: deps.requestedModel,
      servedModel: last?.servedModel ?? null,
      generatedAt: deps.now(),
      packHash: packHash(pack),
    };
  };
  const fallback = (reason: string): GeneratedBrief => {
    deps.log?.(`${pack.scenarioId}: using the deterministic fallback (${reason})`);
    const brief = fallbackBrief(pack);
    const { brief: _validated, ...validation } = validateBrief(brief, pack, deps.glossary);
    void _validated;
    return done(brief, validation, reason);
  };

  if (!deps.llm) return fallback("no model available (no API key)");

  const first: Anthropic.MessageParam[] = [{ role: "user", content: userMessage(pack) }];
  const a1 = await attempt(deps, pack, "initial", first);
  attempts.push(a1.record);
  if (a1.record.validation?.pass && a1.brief) return done(a1.brief, a1.record.validation);

  // One repair call. It sees the previous output and the validator's findings
  // (or the parse/stop error when there was nothing to validate).
  const findings = a1.record.validation
    ? repairMessage(a1.record.validation)
    : `Your previous reply could not be used (${a1.record.error ?? "unknown error"}). Return the full brief as JSON that matches the schema.`;
  const second: Anthropic.MessageParam[] = a1.record.rawText
    ? [...first, { role: "assistant", content: a1.record.rawText }, { role: "user", content: findings }]
    : first;
  const a2 = await attempt(deps, pack, "repair", second);
  attempts.push(a2.record);
  if (a2.record.validation?.pass && a2.brief) return done(a2.brief, a2.record.validation);

  const why = a2.record.validation
    ? `still failed after one repair: ${a2.record.validation.results.filter((r) => !r.pass && r.severity === "error").map((r) => r.rule).join(", ")}`
    : `repair attempt failed: ${a2.record.error ?? "unknown error"}`;
  return fallback(why);
}

export async function generateBrief(
  scenarioId: string,
  deps: GenerateDeps,
  opts: { feed?: "unavailable" } = {},
): Promise<GeneratedBrief | UnavailableBrief> {
  const pack = buildContextPack(scenarioId, opts);
  if (isUnavailable(pack)) return { scenarioId, unavailable: true };
  return generateBriefForPack(pack, deps);
}
