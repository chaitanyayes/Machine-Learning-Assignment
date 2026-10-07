import { describe, expect, it } from "vitest";
import { fallbackGeneric, generateGeneric, validateGeneric } from "@/lib/brief/generic";
import { buildContextPack, isUnavailable, type ContextPack } from "@/lib/contextPack/build";
import { scenarios } from "@/lib/data/load";
import type { LlmCaller } from "@/lib/llm/client";

function pack(id: string): ContextPack {
  const p = buildContextPack(id);
  if (isUnavailable(p)) throw new Error("unavailable");
  return p;
}

const reply = (text: string): LlmCaller => async () => ({
  text,
  stopReason: "end_turn",
  requestedModel: "fake",
  servedModel: "fake",
  usage: { inputTokens: 1, outputTokens: 1 },
});

describe("generic research arm", () => {
  it("has a fallback paragraph that passes its own checks for every scenario", () => {
    for (const s of scenarios) {
      const r = validateGeneric(fallbackGeneric(pack(s.id)), pack(s.id));
      expect(r.results.filter((x) => !x.pass).map((x) => `${s.id} ${x.rule}: ${x.detail}`)).toEqual([]);
    }
  });

  it("rejects an invented number, an unhedged cause and advice", () => {
    const p = pack("S01");
    const base = fallbackGeneric(p);
    expect(validateGeneric(`${base} It rose 12.3% in a day.`, p).pass).toBe(false);
    expect(validateGeneric(`${base} The rise happened because of the results.`, p).pass).toBe(false);
    expect(validateGeneric(`${base} This is a good time to buy.`, p).pass).toBe(false);
  });

  it("falls back when the model's paragraph fails twice", async () => {
    const p = pack("S01");
    const out = await generateGeneric(p, { llm: reply(JSON.stringify({ paragraph: "It will rise." })), systemPrompt: "", serverFallback: false });
    expect(out.fallbackUsed).toBe(true);
    expect(out.validation.pass).toBe(true);
  });

  it("keeps a valid model paragraph", async () => {
    const p = pack("S01");
    const paragraph = `${fallbackGeneric(p).replace("We couldn't generate a fuller explanation for this stock right now, so this shows only the computed figures.", "")}Its results came out on 22 Jul and may have contributed to part of the rise.`;
    const out = await generateGeneric(p, { llm: reply(JSON.stringify({ paragraph })), systemPrompt: "", serverFallback: false });
    expect(out.fallbackUsed).toBe(false);
  });
});
