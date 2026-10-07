import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { serialisePack, type ContextPack } from "@/lib/contextPack/build";
import type { LlmCaller } from "@/lib/llm/client";
import { ruleV3, ruleV5, ruleV6, ruleV8, summarise, type TextField, type ValidationReport } from "./validate";

// The research-mode comparison arm (arm=generic): one GR-1-style paragraph.
// It differs from the brief in FORMAT only. It gets the same grounding and
// safety checks (numbers from the pack, hedged causes, no advice, no other
// companies), so the comparison can't be won by letting the control hallucinate.

export const GenericWire = z.object({ paragraph: z.string() }).strict();
export const GENERIC_FORMAT = zodOutputFormat(GenericWire);

export type GeneratedGeneric = {
  paragraph: string;
  validation: ValidationReport;
  fallbackUsed: boolean;
  fallbackReason?: string;
};

export function validateGeneric(paragraph: string, pack: ContextPack): ValidationReport {
  // Checked as a headline-style field: a causal word needs a hedge (V5).
  const fields: TextField[] = [{ path: "paragraph", text: paragraph, kind: "headline" }];
  const words = paragraph.trim().split(/\s+/).filter(Boolean).length;
  const length = {
    rule: "V1" as const,
    pass: words >= 40 && words <= 160,
    severity: "error" as const,
    detail: `${words} words`,
    issues: words >= 40 && words <= 160 ? [] : [{ path: "paragraph", message: `${words} words (expected about 80–120)` }],
  };
  return summarise([length, ruleV3(fields, pack), ruleV5(fields), ruleV6(fields), ruleV8(fields, pack)]);
}

/** Deterministic paragraph from computed facts, used when generation fails or no model is available. */
export function fallbackGeneric(pack: ContextPack): string {
  const c = (key: string) => pack.computed.find((x) => x.key === key);
  const stock = c("stock_window")!;
  const sector = c("sector_window")!;
  const market = c("market_window")!;
  const days = c("window_sessions")!;
  const verb = (x: typeof stock) => (x.direction === "up" ? `rose ${x.display}` : x.direction === "down" ? `fell ${x.display}` : "was roughly unchanged");
  return [
    `${pack.company.name}'s share price ${verb(stock)} over the last ${days.display}.`,
    `Over the same days, the ${pack.indexNames.sector} ${verb(sector)} and the ${pack.indexNames.market} ${verb(market)}.`,
    `${pack.company.description}`,
    `We couldn't generate a fuller explanation for this stock right now, so this shows only the computed figures.`,
  ].join(" ");
}

export async function generateGeneric(
  pack: ContextPack,
  deps: { llm: LlmCaller | null; systemPrompt: string; serverFallback: boolean },
): Promise<GeneratedGeneric> {
  const fallback = (reason: string): GeneratedGeneric => {
    const paragraph = fallbackGeneric(pack);
    return { paragraph, validation: validateGeneric(paragraph, pack), fallbackUsed: true, fallbackReason: reason };
  };
  if (!deps.llm) return fallback("no model available (no API key)");
  let lastError = "unknown error";
  for (let i = 0; i < 2; i++) {
    try {
      const res = await deps.llm({
        purpose: "generic",
        system: deps.systemPrompt,
        messages: [{ role: "user", content: `CONTEXT PACK:\n${serialisePack(pack)}\n\nWrite the paragraph as JSON.` }],
        maxTokens: 4000,
        effort: "low",
        format: GENERIC_FORMAT,
        serverFallback: deps.serverFallback,
      });
      const parsed = GenericWire.safeParse(JSON.parse(res.text ?? "null"));
      if (!parsed.success) {
        lastError = "output did not match the schema";
        continue;
      }
      const validation = validateGeneric(parsed.data.paragraph, pack);
      if (validation.pass) return { paragraph: parsed.data.paragraph, validation, fallbackUsed: false };
      lastError = `failed ${validation.results.filter((r) => !r.pass && r.severity === "error").map((r) => r.rule).join(", ")}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  return fallback(lastError);
}
