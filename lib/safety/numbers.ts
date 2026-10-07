// Number grounding (V3). extractTokens finds every number-like thing in a
// string (dates, month-years, years, quarters, ratios, ₹ amounts, percentages,
// plain numbers). buildAllowed runs the same extractor over the context pack,
// plus the pack's structured values, and isGrounded checks a token from model
// output against that set within rounding tolerance.

export type NumberFamily = "percent" | "rupee" | "plain";

export type Token =
  | { kind: "date"; raw: string; day: number; month: number; year: number | null }
  | { kind: "monthYear"; raw: string; month: number; year: number }
  | { kind: "year"; raw: string; year: number }
  | { kind: "label"; raw: string; value: string }
  | { kind: "ratio"; raw: string; value: string }
  | { kind: "number"; raw: string; family: NumberFamily; value: number; decimals: number; scale: number };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const NUM = "(\\d[\\d,]*(?:\\.\\d+)?)";
const SCALES: Record<string, number> = {
  "lakh crore": 1e12, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7, cr: 1e7,
  thousand: 1e3, k: 1e3, million: 1e6, billion: 1e9,
};
const SCALE_RE = "(lakh crore|lakhs?|crores?|cr|thousand|million|billion|k)";

type Rule = { re: RegExp; make: (m: RegExpExecArray) => Token | Token[] | null };

function parseNum(s: string): { value: number; decimals: number } {
  const clean = s.replace(/,/g, "");
  const dot = clean.indexOf(".");
  return { value: Number(clean), decimals: dot === -1 ? 0 : clean.length - dot - 1 };
}

// Order matters: earlier rules consume their span so later rules can't re-read it.
const RULES: Rule[] = [
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/gi,
    make: (m) => ({ kind: "date", raw: m[0], year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }),
  },
  {
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?(?:,?\\s+(\\d{4}))?\\b`, "gi"),
    make: (m) => ({ kind: "date", raw: m[0], day: Number(m[1]), month: MONTHS[m[2]!.toLowerCase()]!, year: m[3] ? Number(m[3]) : null }),
  },
  {
    re: new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{4})\\b`, "gi"),
    make: (m) => ({ kind: "monthYear", raw: m[0], month: MONTHS[m[1]!.toLowerCase()]!, year: Number(m[2]) }),
  },
  {
    re: new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi"),
    make: (m) => ({ kind: "date", raw: m[0], month: MONTHS[m[1]!.toLowerCase()]!, day: Number(m[2]), year: m[3] ? Number(m[3]) : null }),
  },
  { re: /\b(Q[1-4]|H[12]|FY\s?\d{2,4})\b/gi, make: (m) => ({ kind: "label", raw: m[0], value: m[1]!.toUpperCase().replace(/\s/g, "") }) },
  { re: /\b(\d+)\s?:\s?(\d+)\b/g, make: (m) => ({ kind: "ratio", raw: m[0], value: `${m[1]}:${m[2]}` }) },
  {
    re: new RegExp(`(?:₹|\\brs\\.?|\\binr)\\s?${NUM}(?:\\s*${SCALE_RE}\\b)?`, "gi"),
    make: (m) => {
      const { value, decimals } = parseNum(m[1]!);
      const scale = m[2] ? SCALES[m[2].toLowerCase()]! : 1;
      return { kind: "number", raw: m[0], family: "rupee", value, decimals, scale };
    },
  },
  {
    // Ranges such as "3–5%" or "7 to 9 per cent": both ends are percentages.
    re: new RegExp(`${NUM}\\s*(?:–|-|to)\\s*${NUM}\\s*(%|per\\s?cent\\b|percentage points?\\b)`, "gi"),
    make: (m) => [
      { kind: "number", raw: m[1]!, family: "percent", scale: 1, ...parseNum(m[1]!) },
      { kind: "number", raw: m[2]!, family: "percent", scale: 1, ...parseNum(m[2]!) },
    ],
  },
  {
    re: new RegExp(`${NUM}\\s*(%|per\\s?cent\\b|percentage points?\\b|pp\\b)`, "gi"),
    make: (m) => ({ kind: "number", raw: m[0], family: "percent", scale: 1, ...parseNum(m[1]!) }),
  },
  {
    re: new RegExp(`${NUM}\\s*${SCALE_RE}\\b`, "gi"),
    make: (m) => ({ kind: "number", raw: m[0], family: "rupee", scale: SCALES[m[2]!.toLowerCase()]!, ...parseNum(m[1]!) }),
  },
  {
    re: /(?<![\w.])(\d+)(?:st|nd|rd|th)\b/gi,
    make: (m) => ({ kind: "number", raw: m[0], family: "plain", value: Number(m[1]), decimals: 0, scale: 1 }),
  },
  {
    re: new RegExp(`(?<![\\w.])${NUM}(?![\\w])`, "g"),
    make: (m) => {
      const { value, decimals } = parseNum(m[1]!);
      if (decimals === 0 && !m[1]!.includes(",") && value >= 1990 && value <= 2099) {
        return { kind: "year", raw: m[0], year: value };
      }
      return { kind: "number", raw: m[0], family: "plain", value, decimals, scale: 1 };
    },
  },
];

export function extractTokens(text: string): Token[] {
  const taken: boolean[] = new Array(text.length).fill(false);
  const found: { at: number; token: Token }[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) {
        rule.re.lastIndex++;
        continue;
      }
      let overlap = false;
      for (let i = start; i < end; i++) if (taken[i]) overlap = true;
      if (overlap) continue;
      const made = rule.make(m);
      if (!made) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      for (const token of Array.isArray(made) ? made : [made]) found.push({ at: start, token });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.token);
}

export type AllowedSet = {
  numbers: { family: NumberFamily; value: number }[];
  dates: { day: number; month: number; year: number }[];
  monthYears: Set<string>;
  years: Set<number>;
  labels: Set<string>;
  ratios: Set<string>;
};

export function emptyAllowed(): AllowedSet {
  return { numbers: [], dates: [], monthYears: new Set(), years: new Set(), labels: new Set(), ratios: new Set() };
}

export function addIsoDate(allowed: AllowedSet, iso: string): void {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso);
  if (!m) return;
  const year = Number(m[1]);
  const month = Number(m[2]);
  allowed.years.add(year);
  allowed.monthYears.add(`${year}-${month}`);
  if (m[3]) allowed.dates.push({ year, month, day: Number(m[3]) });
}

export function addNumber(allowed: AllowedSet, family: NumberFamily, value: number): void {
  if (Number.isFinite(value)) allowed.numbers.push({ family, value: Math.abs(value) });
}

/** Adds every token found in a pack string to the allowed set. */
export function addText(allowed: AllowedSet, text: string): void {
  for (const t of extractTokens(text)) {
    switch (t.kind) {
      case "date":
        if (t.year !== null) allowed.dates.push({ day: t.day, month: t.month, year: t.year });
        else allowed.dates.push({ day: t.day, month: t.month, year: -1 });
        if (t.year !== null) {
          allowed.years.add(t.year);
          allowed.monthYears.add(`${t.year}-${t.month}`);
        }
        break;
      case "monthYear":
        allowed.monthYears.add(`${t.year}-${t.month}`);
        allowed.years.add(t.year);
        break;
      case "year":
        allowed.years.add(t.year);
        break;
      case "label":
        allowed.labels.add(t.value);
        break;
      case "ratio":
        allowed.ratios.add(t.value);
        break;
      case "number":
        addNumber(allowed, t.family, t.value * t.scale);
        break;
    }
  }
}

function roundTo(x: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(x * f) / f;
}

/** True when the token is backed by the allowed set (within the rounding the text itself uses). */
export function isGrounded(token: Token, allowed: AllowedSet): boolean {
  switch (token.kind) {
    case "date":
      return allowed.dates.some(
        (d) => d.day === token.day && d.month === token.month && (token.year === null || d.year === token.year),
      );
    case "monthYear":
      return allowed.monthYears.has(`${token.year}-${token.month}`);
    case "year":
      return allowed.years.has(token.year);
    case "label":
      return allowed.labels.has(token.value);
    case "ratio":
      return allowed.ratios.has(token.value);
    case "number": {
      const target = token.value;
      return allowed.numbers.some((n) => {
        if (n.family !== token.family) return false;
        if (token.family === "rupee") {
          // Compare in rupees at the precision the text used.
          const tolerance = 0.5 * Math.pow(10, -token.decimals) * token.scale + 1e-9;
          return Math.abs(n.value - target * token.scale) <= tolerance;
        }
        return Math.abs(roundTo(n.value, token.decimals) - target) < 1e-9;
      });
    }
  }
}

/** Plain integers that are always allowed in whatToCheck ("Check these 3 things"). */
export function isSmallCountingInteger(token: Token): boolean {
  return token.kind === "number" && token.family === "plain" && token.decimals === 0 && token.value >= 1 && token.value <= 5;
}
