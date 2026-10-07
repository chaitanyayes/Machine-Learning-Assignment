import { buildContextPack, isUnavailable, type ContextPack } from "@/lib/contextPack/build";
import { glossary } from "@/lib/data/load";
import { cachedBrief } from "./cached";
import { generateBriefForPack, packHash, type GeneratedBrief } from "./generate";
import { anthropicCaller, liveAvailable, loadPrompt, modelId } from "@/lib/llm/server";

// What the app shows for a scenario's brief, in either mode:
// - cached (default): the committed brief, or the deterministic fallback if none exists.
// - live: generate now (results memoised per instance for 10 minutes).

export type BriefMode = "cached" | "live";

export type ServedBrief =
  | { unavailable: true; scenarioId: string; asOf: string }
  | { unavailable?: false; source: "cached" | "live" | "fallback"; result: GeneratedBrief; pack: ContextPack; stale: boolean };

export function briefMode(): BriefMode {
  return process.env.BRIEF_MODE === "live" && liveAvailable() ? "live" : "cached";
}

const memo = new Map<string, { at: number; value: GeneratedBrief }>();
const MEMO_MS = 10 * 60_000;

export async function generateLive(pack: ContextPack): Promise<GeneratedBrief> {
  return generateBriefForPack(pack, {
    llm: anthropicCaller,
    systemPrompt: loadPrompt("brief-system"),
    glossary,
    now: () => new Date().toISOString(),
    serverFallback: true,
    requestedModel: modelId(),
  });
}

export async function serveBrief(scenarioId: string, opts: { feed?: "unavailable"; forceLive?: boolean } = {}): Promise<ServedBrief> {
  const pack = buildContextPack(scenarioId, opts.feed ? { feed: opts.feed } : {});
  if (isUnavailable(pack)) return { unavailable: true, scenarioId, asOf: pack.asOf };

  if (opts.forceLive || briefMode() === "live") {
    const hit = memo.get(scenarioId);
    if (!opts.forceLive && hit && Date.now() - hit.at < MEMO_MS) {
      return { source: "live", result: hit.value, pack, stale: false };
    }
    const value = await generateLive(pack);
    memo.set(scenarioId, { at: Date.now(), value });
    return { source: value.fallbackUsed ? "fallback" : "live", result: value, pack, stale: false };
  }

  const cached = cachedBrief(scenarioId);
  if (cached) return { source: cached.fallbackUsed ? "fallback" : "cached", result: cached, pack, stale: cached.packHash !== packHash(pack) };
  // No committed brief: serve the deterministic fallback, computed now.
  const fallback = await generateBriefForPack(pack, {
    llm: null,
    systemPrompt: "",
    glossary,
    now: () => new Date().toISOString(),
    serverFallback: false,
    requestedModel: null,
  });
  return { source: "fallback", result: fallback, pack, stale: false };
}
