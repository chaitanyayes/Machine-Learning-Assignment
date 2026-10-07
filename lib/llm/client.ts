import Anthropic from "@anthropic-ai/sdk";

// The only module that talks to the Claude API. Route handlers import it via
// lib/llm/server.ts (which adds the "server-only" guard); scripts import it
// directly. Model and key come from the environment; nothing here ever
// reaches a client bundle.

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export function modelId(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

export function liveAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export type Effort = "low" | "medium" | "high";

export type LlmRequest = {
  /** Short label for logs ("brief", "brief-repair", "router", "judge"). */
  purpose: string;
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens: number;
  effort: Effort;
  /** JSON output format (e.g. from zodOutputFormat). Omit for plain text. */
  format?: Anthropic.JSONOutputFormat;
  /** Re-run a declined request on another model server-side. On for user-facing calls, off for evals. */
  serverFallback: boolean;
  model?: string;
};

export type LlmResponse = {
  text: string | null;
  stopReason: string | null;
  requestedModel: string;
  servedModel: string;
  usage: { inputTokens: number; outputTokens: number };
};

export type LlmCaller = (req: LlmRequest) => Promise<LlmResponse>;

/** Models that predate the effort parameter reject it, so it is only sent where supported. */
export function supportsEffort(model: string): boolean {
  return !/haiku-4-5|haiku-3|sonnet-4-5|opus-4-1/.test(model);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: 90_000, maxRetries: 2 });
  return client;
}

function textOf(content: readonly { type: string }[]): string | null {
  const parts = content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text);
  return parts.length ? parts.join("") : null;
}

export const anthropicCaller: LlmCaller = async (req) => {
  if (!liveAvailable()) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = req.model ?? modelId();
  const outputConfig: Anthropic.OutputConfig = {
    ...(supportsEffort(model) ? { effort: req.effort } : {}),
    ...(req.format ? { format: req.format } : {}),
  };
  const base = {
    model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: req.messages,
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
  };
  const response = req.serverFallback
    ? await getClient().beta.messages.create({
        ...base,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
    : await getClient().messages.create(base);
  return {
    text: textOf(response.content),
    stopReason: response.stop_reason ?? null,
    requestedModel: model,
    servedModel: response.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
};
