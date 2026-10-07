import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ComprehensionFile, GlossaryFile, ScenariosFile } from "@/lib/data/schemas";

// Content checks for the two hand-written copy files. They are read straight
// from disk (not through lib/data/load) so this test only depends on them.

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), "data", file), "utf8"));
}

const glossary = GlossaryFile.parse(readJson("glossary.json"));
const comprehension = ComprehensionFile.parse(readJson("comprehension.json"));
const scenarios = ScenariosFile.parse(readJson("scenarios.json"));

const BANNED_WORDS = [
  "buy",
  "sell",
  "should",
  "target price",
  "will rise",
  "will fall",
  "multibagger",
  "guaranteed",
  "undervalued",
  "overvalued",
  "sure-shot",
];

/** Verdict words. "bad" is allowed only inside the two glossary terms that need it. */
const VERDICT_WORDS = ["good", "bad", "safe", "cheap", "expensive"];
const ALLOWED_VERDICT_PHRASES = [/\bbad loans?\b/gi, /\bbad month\b/gi];

const REQUIRED_TERM_IDS = [
  "share",
  "stock-exchange",
  "index",
  "sector-index",
  "market-capitalisation",
  "pe-ratio",
  "sector-median-pe",
  "earnings-per-share",
  "revenue",
  "net-profit",
  "net-margin",
  "roe",
  "debt-to-equity",
  "promoter",
  "promoter-holding",
  "promoter-pledge",
  "nbfc",
  "net-interest-income",
  "gross-npa",
  "quarterly-results",
  "revenue-outlook",
  "dividend",
  "bonus-issue",
  "stock-split",
  "ex-date",
  "record-date",
  "corporate-action",
  "upper-circuit",
  "lower-circuit",
  "surveillance-measures",
  "block-deal",
  "index-inclusion",
  "volatility",
  "drawdown",
  "typical-bad-month",
  "annualised",
  "trading-session",
  "small-cap",
  "liquidity",
  "exchange-filing",
  "agm",
  "stale-news",
];

/** Whole-word, case-insensitive match; a space or hyphen inside the phrase matches either. */
function hasWord(text: string, phrase: string): boolean {
  const body = phrase
    .toLowerCase()
    .split(/[\s-]+/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s-]+");
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, "i").test(text.replace(/[‐-–]/g, "-"));
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** One sentence: a capital or digit first, a full stop last, and no other sentence end. Decimals don't count. */
function isOneSentence(text: string): boolean {
  const body = text.replace(/(\d)\.(\d)/g, "$1$2");
  return /^[A-Z0-9]/.test(body) && /^[^.!?]+\.$/.test(body);
}

function glossaryTexts(): string[] {
  return glossary.flatMap((g) => [g.term, ...g.aliases, g.definition]);
}

function comprehensionTexts(): string[] {
  return comprehension.flatMap((s) => s.questions.flatMap((q) => [q.prompt, ...q.options.map((o) => o.text)]));
}

describe("glossary.json", () => {
  it("has 40–44 terms with unique ids and unique terms", () => {
    expect(glossary.length).toBeGreaterThanOrEqual(40);
    expect(glossary.length).toBeLessThanOrEqual(44);
    expect(new Set(glossary.map((g) => g.id)).size).toBe(glossary.length);
    expect(new Set(glossary.map((g) => g.term.toLowerCase())).size).toBe(glossary.length);
  });

  it("includes every required term", () => {
    const ids = new Set(glossary.map((g) => g.id));
    for (const id of REQUIRED_TERM_IDS) expect(ids.has(id), id).toBe(true);
  });

  it("no alias collides with any term or with another alias", () => {
    const owner = new Map<string, string>();
    for (const g of glossary) {
      for (const label of [g.term, ...g.aliases]) {
        const key = label.trim().toLowerCase();
        expect(key.length, `empty label in ${g.id}`).toBeGreaterThan(0);
        expect(owner.get(key), `"${label}" in ${g.id} is already used by ${owner.get(key)}`).toBeUndefined();
        owner.set(key, g.id);
      }
    }
  });

  it("every definition is one sentence of at most 30 words", () => {
    for (const g of glossary) {
      expect(wordCount(g.definition), g.id).toBeLessThanOrEqual(30);
      expect(isOneSentence(g.definition), g.id).toBe(true);
    }
  });
});

describe("comprehension.json", () => {
  it("has exactly one set per scenario, in scenario order", () => {
    expect(comprehension.map((s) => s.scenarioId)).toEqual(scenarios.map((s) => s.id));
  });

  it("each set has q1 what_happened, q2 main_risk and q3 cause_certain", () => {
    for (const s of comprehension) {
      expect(s.questions.map((q) => [q.id, q.kind]), s.scenarioId).toEqual([
        ["q1", "what_happened"],
        ["q2", "main_risk"],
        ["q3", "cause_certain"],
      ]);
    }
  });

  it("options are lettered a, b, c(, d) and the correct option exists", () => {
    for (const s of comprehension) {
      for (const q of s.questions) {
        const ids = q.options.map((o) => o.id);
        expect(ids, `${s.scenarioId} ${q.id}`).toEqual(["a", "b", "c", "d"].slice(0, ids.length));
        expect(ids, `${s.scenarioId} ${q.id}`).toContain(q.correctOptionId);
        expect(new Set(q.options.map((o) => o.text)).size).toBe(q.options.length);
      }
    }
  });

  it("the correct option can't be spotted by its length", () => {
    const questions = comprehension.flatMap((s) => s.questions);
    let longest = 0;
    let shortest = 0;
    for (const q of questions) {
      const lengths = q.options.map((o) => o.text.length);
      const correct = q.options.find((o) => o.id === q.correctOptionId)?.text.length ?? 0;
      if (correct === Math.max(...lengths)) longest++;
      if (correct === Math.min(...lengths)) shortest++;
    }
    expect(longest).toBeLessThanOrEqual(questions.length / 3);
    expect(shortest).toBeLessThanOrEqual(questions.length / 3);
  });
});

describe("copy rules for both files", () => {
  const texts = [...glossaryTexts(), ...comprehensionTexts()];

  it("contains no advice or prediction words", () => {
    for (const text of texts) {
      for (const word of BANNED_WORDS) expect(hasWord(text, word), `"${word}" in: ${text}`).toBe(false);
    }
  });

  it("contains no verdict words outside the terms that need them", () => {
    for (const text of texts) {
      const stripped = ALLOWED_VERDICT_PHRASES.reduce((t, re) => t.replace(re, ""), text);
      for (const word of VERDICT_WORDS) expect(hasWord(stripped, word), `"${word}" in: ${text}`).toBe(false);
    }
  });

  it("contains no exclamation marks or emojis", () => {
    for (const text of texts) {
      expect(text, text).not.toMatch(/!/);
      expect(text, text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
