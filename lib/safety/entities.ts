import { companies } from "@/lib/data/load";
import { normaliseText } from "./phrases";

// Entity checks (V8). Model output may name only the subject company. A
// sibling may be named only in a sentence that says it is a different
// company. Other fictional companies and well-known real companies, brands or
// regulators fail, unless the same name appears in the context pack (e.g. the
// market index is "modelled on Nifty 50").

/** Real listed companies, brands and market bodies a beginner might type or a model might recall. */
export const REAL_ENTITY_DENYLIST: readonly string[] = [
  "Reliance", "Tata", "TCS", "Infosys", "Wipro", "HCL", "Tech Mahindra", "LTIMindtree", "HDFC", "ICICI", "SBI",
  "State Bank", "Axis Bank", "Kotak", "IndusInd", "Yes Bank", "Bandhan", "IDFC", "Bajaj", "Adani", "Airtel", "Jio",
  "Vodafone", "Maruti", "Mahindra", "Hero MotoCorp", "Eicher", "TVS", "Ashok Leyland", "Hindustan Unilever",
  "HUL", "ITC", "Nestle", "Britannia", "Dabur", "Marico", "Asian Paints", "Berger", "Pidilite", "Sun Pharma",
  "Cipla", "Dr Reddy", "Dr. Reddy", "Lupin", "Zomato", "Eternal", "Swiggy", "Paytm", "Nykaa", "Byju", "Unacademy",
  "PhysicsWallah", "Ola", "Suzlon", "IRFC", "LIC", "Coal India", "ONGC", "NTPC", "Power Grid", "BPCL", "HPCL",
  "Indian Oil", "Larsen", "L&T", "BHEL", "Siemens", "ABB", "Titan", "DMart", "Avenue Supermarts", "Trent",
  "Tesla", "Apple", "Google", "Alphabet", "Microsoft", "Amazon", "Nvidia", "Meta", "Netflix", "Groww", "Zerodha",
  "Upstox", "Angel One", "SEBI", "RBI", "Reserve Bank", "NSE", "BSE", "Sensex", "Nifty", "Bank Nifty",
];

const COMPANY_SUFFIX =
  /\b((?:[A-Z][A-Za-z&.'-]+\s+){1,3})(Bank|Banks|Motors|Ltd|Limited|Industries|Pharma|Pharmaceuticals|Finance|Financial|Insurance|Infotech|Technologies|Tech|Telecom|Energy|Paints|Renewables|Engineering|Consumer|Learning|Capital|Securities|Holdings|Group|Corp|Corporation|Inc)\b/g;

const GENERIC_PREFIX_WORDS = new Set([
  "the", "this", "that", "its", "other", "another", "each", "every", "a", "an", "private", "public", "many", "most",
  "some", "all", "both", "these", "those", "big", "large", "small", "indian", "listed", "similar", "regional",
  "central", "same", "sector", "market", "simulated",
]);

export type EntityContext = {
  subjectName: string;
  siblingNames: readonly string[];
  /** All text in the context pack, for "is this name in the pack?" checks. */
  packText: string;
};

export type EntityIssue = { name: string; reason: "other_company" | "sibling_without_note" | "real_entity" | "unknown_company" };

function wordRegex(name: string, caseSensitive = false): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, caseSensitive ? "" : "i");
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

export function findEntityIssues(text: string, ctx: EntityContext): EntityIssue[] {
  const issues: EntityIssue[] = [];
  const subject = normaliseText(ctx.subjectName);
  const siblings = ctx.siblingNames.map(normaliseText);
  const pack = ctx.packText;

  // 1. Other companies in the fictional universe (full name or distinctive first word).
  for (const c of companies) {
    const name = normaliseText(c.name);
    if (name === subject) continue;
    const isSibling = siblings.includes(name);
    if (isSibling) {
      for (const s of sentences(text)) {
        if (wordRegex(c.name).test(s) && !/different company/i.test(s)) {
          issues.push({ name: c.name, reason: "sibling_without_note" });
        }
      }
      continue;
    }
    const first = c.name.split(/\s+/)[0]!;
    const subjectFirst = ctx.subjectName.split(/\s+/)[0]!;
    const shared = first.toLowerCase() === subjectFirst.toLowerCase();
    if (wordRegex(c.name).test(text) || (!shared && wordRegex(first).test(text))) {
      issues.push({ name: c.name, reason: "other_company" });
    }
  }

  // 2. Real companies, brands and regulators — unless the pack itself uses the name.
  // Case-sensitive: these are proper nouns, and "apple" or "titan" in lower case are ordinary words.
  for (const name of REAL_ENTITY_DENYLIST) {
    if (wordRegex(name, true).test(text) && !wordRegex(name, true).test(pack)) {
      issues.push({ name, reason: "real_entity" });
    }
  }

  // 3. Anything that looks like a company name ("Something Bank") not covered above.
  COMPANY_SUFFIX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMPANY_SUFFIX.exec(text)) !== null) {
    const words = m[1]!.trim().split(/\s+/);
    const meaningful = words.filter((w) => !GENERIC_PREFIX_WORDS.has(w.toLowerCase()));
    if (meaningful.length === 0) continue;
    const phrase = `${meaningful.join(" ")} ${m[2]}`;
    const lower = normaliseText(phrase);
    const known = [subject, ...siblings].some((n) => n.startsWith(lower) || lower.startsWith(n) || n.includes(lower));
    const inUniverse = companies.some((c) => normaliseText(c.name).includes(lower) || lower.includes(normaliseText(c.name)));
    if (known || inUniverse) continue;
    if (wordRegex(phrase).test(pack)) continue;
    issues.push({ name: phrase, reason: "unknown_company" });
  }
  return issues;
}
