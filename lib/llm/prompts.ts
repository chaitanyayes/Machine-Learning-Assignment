import { readFileSync } from "node:fs";
import { join } from "node:path";

// Prompts live in /prompts as markdown and are read at runtime (build brief
// §0). next.config.ts lists /prompts in outputFileTracingIncludes so the files
// ship with the serverless functions.

export const PROMPT_FILES = [
  "brief-system",
  "ask-system",
  "intent-router",
  "redirect-advice",
  "judge-faithfulness",
  "generic-explainer",
] as const;
export type PromptName = (typeof PROMPT_FILES)[number];

const cache = new Map<PromptName, string>();

export function loadPrompt(name: PromptName): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const text = readFileSync(join(process.cwd(), "prompts", `${name}.md`), "utf8").trim();
  cache.set(name, text);
  return text;
}
