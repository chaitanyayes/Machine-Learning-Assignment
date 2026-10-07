// Phrase lists used by the validator (V5, V6, V7) and the Ask router. They
// live in one file so they can grow without touching rule code. Matching is
// case-insensitive and on word boundaries (see containsPhrase).

/** V6: advice and prediction language. Banned in every field of every output. */
export const BANNED_PHRASES: readonly string[] = [
  // English (build brief §8)
  "you should",
  "buy now",
  "good time to buy",
  "target price",
  "will rise",
  "will fall",
  "will go up",
  "guaranteed",
  "sure-shot",
  "sureshot",
  "multibagger",
  "multi-bagger",
  "safe stock",
  "can't go wrong",
  "cannot go wrong",
  "undervalued",
  "overvalued",
  "strong buy",
  "accumulate",
  "book profit",
  "stop loss at",
  // Hinglish (build brief §8)
  "le lo",
  "le lu",
  "bech do",
  "pakka",
  "zaroor khareedo",
];

/** V5: words that assert causation. */
export const CAUSAL_CONNECTORS: readonly string[] = [
  "because",
  "due to",
  "driven by",
  "caused",
  "causing",
  "led to",
  "leading to",
  "on the back of",
  "thanks to",
  "as a result of",
  "owing to",
  "triggered by",
  "fuelled by",
  "fueled by",
];

/** V5/V7: hedges that make a causal INTERPRETATION acceptable (word forms of the brief's list). */
export const HEDGES: readonly string[] = [
  "may",
  "might",
  "appear",
  "appears",
  "appeared",
  "possibly",
  "possible",
  "coincide",
  "coincides",
  "coincided",
  "coinciding",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalises curly quotes and hyphen variants so "can’t" matches "can't". */
export function normaliseText(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-–]/g, "-")
    .toLowerCase();
}

const cache = new Map<string, RegExp>();

function phraseRegex(phrase: string): RegExp {
  let re = cache.get(phrase);
  if (!re) {
    // Spaces and hyphens inside a phrase match either: "sure-shot" also catches "sure shot".
    const body = normaliseText(phrase).split(/[\s-]+/).map(escapeRegex).join("[\\s-]+");
    re = new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, "i");
    cache.set(phrase, re);
  }
  return re;
}

export function containsPhrase(text: string, phrase: string): boolean {
  return phraseRegex(phrase).test(normaliseText(text));
}

export function findPhrases(text: string, phrases: readonly string[]): string[] {
  return phrases.filter((p) => containsPhrase(text, p));
}
