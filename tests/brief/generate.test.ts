import { describe, expect, it } from "vitest";
import { FALLBACK_NOTICE, fallbackBrief } from "@/lib/brief/fallback";
import { generateBrief, generateBriefForPack, type GenerateDeps } from "@/lib/brief/generate";
import type { BriefWire } from "@/lib/brief/schema";
import { buildContextPack, isUnavailable, type ContextPack } from "@/lib/contextPack/build";
import { glossary } from "@/lib/data/load";
import type { LlmCaller, LlmRequest, LlmResponse } from "@/lib/llm/client";

// The pipeline with a scripted fake model, so the repair and fallback paths
// are tested without an API key.

function pack(id: string): ContextPack {
  const p = buildContextPack(id);
  if (isUnavailable(p)) throw new Error("unavailable");
  return p;
}

function scripted(replies: (string | Partial<LlmResponse> | Error)[]): { llm: LlmCaller; calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  const llm: LlmCaller = async (req) => {
    calls.push(req);
    const next = replies.shift();
    if (next === undefined) throw new Error("no more scripted replies");
    if (next instanceof Error) throw next;
    const base: LlmResponse = { text: null, stopReason: "end_turn", requestedModel: "fake", servedModel: "fake", usage: { inputTokens: 1, outputTokens: 1 } };
    return typeof next === "string" ? { ...base, text: next } : { ...base, ...next };
  };
  return { llm, calls };
}

function deps(llm: LlmCaller | null): GenerateDeps {
  return { llm, systemPrompt: "SYSTEM", glossary, now: () => "2026-10-06T00:00:00Z", serverFallback: false, requestedModel: "fake" };
}

/** A passing brief: the deterministic fallback, re-labelled as model output. */
function passing(p: ContextPack): BriefWire {
  return fallbackBrief(p);
}

describe("brief generation pipeline", () => {
  const p = pack("S01");

  it("returns the first attempt when it passes", async () => {
    const { llm, calls } = scripted([JSON.stringify(passing(p))]);
    const out = await generateBriefForPack(p, deps(llm));
    expect(out.fallbackUsed).toBe(false);
    expect(out.attempts).toHaveLength(1);
    expect(calls[0]!.format?.type).toBe("json_schema");
    expect(calls[0]!.system).toBe("SYSTEM");
    expect(String(calls[0]!.messages[0]!.content)).toContain("CONTEXT PACK:");
  });

  it("makes exactly one repair call that includes the validator's findings", async () => {
    const bad = passing(p);
    bad.whatHappened[0]!.text = "Hindmark Bank rose 9.9% because of strong results.";
    const { llm, calls } = scripted([JSON.stringify(bad), JSON.stringify(passing(p))]);
    const out = await generateBriefForPack(p, deps(llm));
    expect(out.fallbackUsed).toBe(false);
    expect(out.attempts.map((a) => a.kind)).toEqual(["initial", "repair"]);
    const repair = calls[1]!.messages;
    expect(repair).toHaveLength(3);
    expect(repair[1]!.role).toBe("assistant");
    expect(String(repair[2]!.content)).toMatch(/V3/);
    expect(String(repair[2]!.content)).toMatch(/V5/);
  });

  it("falls back after a failed repair and records why", async () => {
    const bad = passing(p);
    bad.cannotSay = ["This is a good time to buy."];
    const { llm, calls } = scripted([JSON.stringify(bad), JSON.stringify(bad)]);
    const out = await generateBriefForPack(p, deps(llm));
    expect(calls).toHaveLength(2);
    expect(out.fallbackUsed).toBe(true);
    expect(out.fallbackReason).toMatch(/V6/);
    expect(out.notice).toBe(FALLBACK_NOTICE);
    expect(out.validation.pass).toBe(true);
  });

  it("treats a refusal or invalid JSON as a failed attempt", async () => {
    const { llm } = scripted([{ stopReason: "refusal", text: null }, "{not json"]);
    const out = await generateBriefForPack(p, deps(llm));
    expect(out.attempts[0]!.error).toMatch(/refusal/);
    expect(out.attempts[1]!.error).toMatch(/invalid JSON/);
    expect(out.fallbackUsed).toBe(true);
  });

  it("survives an API error", async () => {
    const { llm } = scripted([new Error("overloaded"), new Error("overloaded")]);
    const out = await generateBriefForPack(p, deps(llm));
    expect(out.fallbackUsed).toBe(true);
    expect(out.fallbackReason).toMatch(/overloaded/);
  });

  it("uses the fallback without calling anything when no model is available", async () => {
    const out = await generateBriefForPack(p, deps(null));
    expect(out.fallbackUsed).toBe(true);
    expect(out.attempts).toHaveLength(0);
  });

  it("never calls the model when the data feed is unavailable", async () => {
    const { llm, calls } = scripted([]);
    const out = await generateBrief("S11", deps(llm), { feed: "unavailable" });
    expect(out).toEqual({ scenarioId: "S11", unavailable: true });
    expect(calls).toHaveLength(0);
  });
});
