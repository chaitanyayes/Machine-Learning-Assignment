import { describe, expect, it } from "vitest";
import { fallbackBrief } from "@/lib/brief/fallback";
import type { BriefWire } from "@/lib/brief/schema";
import { repairNotes, validateBrief, type RuleId } from "@/lib/brief/validate";
import { buildContextPack, isUnavailable, type ContextPack } from "@/lib/contextPack/build";
import { glossary } from "@/lib/data/load";

// Each rule is tested with a deliberately bad brief (one targeted defect on top
// of a brief that passes) and the good control. Tests use real context packs.

function pack(id: string): ContextPack {
  const p = buildContextPack(id);
  if (isUnavailable(p)) throw new Error("unavailable");
  return p;
}

const S01 = pack("S01");
const S06 = pack("S06");
const S08 = pack("S08");
const S13 = pack("S13");

/** A hand-written S01 brief in the style the prompt asks for. It must pass. */
function goodS01(): BriefWire {
  return {
    companyId: "hindmark-bank",
    scenarioId: "S01",
    asOf: "2026-07-24",
    attribution: { level: "CLEAR", headline: "Results came out in the same week as the rise" },
    whatHappened: [
      { id: "h1", type: "FACT", text: "Hindmark Bank's share price rose 7.0% over the last 5 trading days.", sourceIds: ["C2", "C1"] },
      { id: "h2", type: "FACT", text: "Over the same days, the Bank index (simulated) rose 3.0%.", sourceIds: ["C3"] },
      { id: "h3", type: "FACT", text: "Its April–June results on 22 Jul showed net profit up 21% from a year earlier.", sourceIds: ["N1"] },
    ],
    whatItMightMean: [
      { id: "m1", type: "INTERPRETATION", text: "Part of the rise matches other banks. The results may have contributed to the rest.", sourceIds: ["C3", "N1"] },
    ],
    whatCouldGoWrong: [
      { id: "r1", type: "FACT", text: "Its biggest fall from a high in the last 3 years was 21.7%.", sourceIds: ["C17", "C15"] },
      { id: "r2", type: "INTERPRETATION", text: "A fast rise after one quarter's results can fade if later results are weaker.", sourceIds: ["N1"] },
    ],
    whatToCheck: [
      { text: "Read the full results filing from 22 Jul.", why: "One quarter can be unusual." },
      { text: "Compare its P/E ratio, which is the price divided by yearly profit per share, with other banks.", why: "It shows how much buyers pay for each rupee of profit." },
      { text: "Check the 3 most recent quarters, not just 1.", why: "A single quarter says little on its own." },
    ],
    conflicts: [],
    cannotSay: ["Whether the rise will last."],
    suggestedQuestions: [
      "Why did it rise more than other banks?",
      "What does net interest income mean?",
      "How far has this stock fallen before?",
    ],
  };
}

function failing(b: unknown, p: ContextPack = S01): RuleId[] {
  return validateBrief(b, p, glossary)
    .results.filter((r) => !r.pass && r.severity === "error")
    .map((r) => r.rule);
}

function issuesFor(rule: RuleId, b: unknown, p: ContextPack = S01): string[] {
  return validateBrief(b, p, glossary).results.find((r) => r.rule === rule)!.issues.map((i) => i.message);
}

describe("validator: good control", () => {
  it("passes a well-formed, grounded S01 brief", () => {
    expect(failing(goodS01())).toEqual([]);
  });
});

describe("V1 schema and counts", () => {
  it("fails a non-object and skips the other rules", () => {
    const r = validateBrief("not json", S01, glossary);
    expect(r.pass).toBe(false);
    expect(r.results.filter((x) => x.skipped).length).toBe(9);
  });
  it("fails too few whatHappened claims and the wrong number of questions", () => {
    const b = goodS01();
    b.whatHappened = b.whatHappened.slice(0, 1);
    b.suggestedQuestions = b.suggestedQuestions.slice(0, 2);
    expect(failing(b)).toContain("V1");
  });
  it("fails an invalid claim type and a mismatched scenario id", () => {
    const b = goodS01() as unknown as Record<string, unknown>;
    (b.whatHappened as { type: string }[])[0]!.type = "OPINION";
    expect(failing(b)).toContain("V1");
    const c = goodS01();
    c.scenarioId = "S02";
    expect(failing(c)).toContain("V1");
  });
  it("fails duplicate claim ids", () => {
    const b = goodS01();
    b.whatItMightMean[0]!.id = "h1";
    expect(failing(b)).toContain("V1");
  });
});

describe("V2 sources", () => {
  it("fails a FACT with no sources", () => {
    const b = goodS01();
    b.whatHappened[1]!.sourceIds = [];
    expect(failing(b)).toContain("V2");
  });
  it("fails a cited id that is not in the pack", () => {
    const b = goodS01();
    b.whatHappened[2]!.sourceIds = ["N99"];
    expect(issuesFor("V2", b).join(" ")).toMatch(/N99/);
  });
});

describe("V3 number grounding", () => {
  it("fails an invented percentage", () => {
    const b = goodS01();
    b.whatHappened[0]!.text = "Hindmark Bank's share price rose 8.4% over the last 5 trading days.";
    expect(issuesFor("V3", b).join(" ")).toMatch(/8\.4%/);
  });
  it("fails an invented date and an invented rupee amount", () => {
    const b = goodS01();
    b.whatHappened[2]!.text = "The bank announced a ₹500 crore buyback on 3 Aug.";
    const issues = issuesFor("V3", b).join(" ");
    expect(issues).toMatch(/₹500 crore/);
    expect(issues).toMatch(/3 Aug/);
  });
  it("accepts rounding the text itself applies (7.0% written as 7%)", () => {
    const b = goodS01();
    b.whatHappened[0]!.text = "Hindmark Bank's share price rose about 7% over the last 5 trading days.";
    expect(failing(b)).not.toContain("V3");
  });
  it("does not let a count stand in for a percentage", () => {
    // The pack has "5 trading days" but no percentage that rounds to 6%.
    const b = goodS01();
    b.whatHappened[0]!.text = "Hindmark Bank's share price rose 6% over the last 5 trading days.";
    expect(failing(b)).toContain("V3");
    b.whatHappened[0]!.text = "Hindmark Bank's share price rose 5 percent over the last 5 trading days.";
    // 5% is grounded only by rounding the sector's 1-month 4.8%: V3 checks values, not which fact they
    // belong to. The faithfulness judge catches a number attached to the wrong fact.
    expect(failing(b)).not.toContain("V3");
  });
  it("allows small counting integers only in whatToCheck", () => {
    const b = goodS01();
    expect(failing(b)).not.toContain("V3"); // "the 3 most recent quarters, not just 1" is in whatToCheck
    b.cannotSay = ["Whether the next 4 quarters will look the same."];
    expect(failing(b)).toContain("V3");
  });
});

describe("V4 freshness", () => {
  it("fails a claim that rests only on stale news without its date", () => {
    const b = fallbackBrief(S06);
    b.whatItMightMean = [{ id: "m9", type: "INTERPRETATION", text: "The metro rail order may matter for future revenue.", sourceIds: ["N13"] }];
    expect(failing(b, S06)).toContain("V4");
  });
  it("passes when the claim says when the news is from", () => {
    const b = fallbackBrief(S06);
    b.whatItMightMean = [{ id: "m9", type: "INTERPRETATION", text: "The metro rail order from 18 Mar may matter for future revenue.", sourceIds: ["N13"] }];
    expect(failing(b, S06)).not.toContain("V4");
  });
});

describe("V5 causal language", () => {
  it("fails a FACT that claims a cause", () => {
    const b = goodS01();
    b.whatHappened[0]!.text = "Hindmark Bank's share price rose 7.0% because of strong results.";
    expect(failing(b)).toContain("V5");
  });
  it("fails an unhedged causal INTERPRETATION and passes a hedged one", () => {
    const b = goodS01();
    b.whatItMightMean[0]!.text = "The rise was driven by the results.";
    expect(failing(b)).toContain("V5");
    b.whatItMightMean[0]!.text = "The rise may have been driven by the results.";
    expect(failing(b)).not.toContain("V5");
  });
  it("fails an unhedged causal headline", () => {
    const b = goodS01();
    b.attribution.headline = "Rose because of results";
    expect(failing(b)).toContain("V5");
  });
});

describe("V6 advice and prediction language", () => {
  const cases = [
    "This is a good time to buy.",
    "The price will rise after the results.",
    "It looks undervalued compared with other banks.",
    "Bhai, le lo, pakka badhega.",
    "A sure-shot pick.",
    "You can’t go wrong here.",
  ];
  for (const text of cases) {
    it(`fails "${text}"`, () => {
      const b = goodS01();
      b.cannotSay = [text];
      expect(failing(b)).toContain("V6");
    });
  }
  it("checks suggested questions too", () => {
    const b = goodS01();
    b.suggestedQuestions[0] = "What is the target price?";
    expect(failing(b)).toContain("V6");
  });
});

describe("V7 attribution consistency", () => {
  it("fails a level that differs from the computed one", () => {
    const b = goodS01();
    b.attribution.level = "UNCLEAR";
    expect(failing(b)).toContain("V7");
  });
  it("on UNCLEAR scenarios, fails an unhedged cause even outside FACT claims", () => {
    const b = fallbackBrief(S08);
    b.whatItMightMean = [{ id: "m1", type: "INTERPRETATION", text: "The rise happened because traders bought on social media.", sourceIds: ["N16"] }];
    expect(failing(b, S08)).toContain("V7");
    b.whatItMightMean[0]!.type = "UNCERTAIN";
    expect(failing(b, S08)).not.toContain("V7");
  });
});

describe("V8 entities", () => {
  it("fails another company from the universe", () => {
    const b = goodS01();
    b.whatItMightMean[0]!.text = "Coastline Bank also rose, so part of the rise may be sector-wide.";
    expect(failing(b)).toContain("V8");
  });
  it("fails a real company name", () => {
    const b = goodS01();
    b.cannotSay = ["Whether it will keep up with HDFC."];
    expect(issuesFor("V8", b).join(" ")).toMatch(/HDFC/);
  });
  it("allows the sibling only in a 'different company' sentence", () => {
    const b = fallbackBrief(S13);
    b.cannotSay = ["Hindmark Bank's results are not about this stock."];
    expect(failing(b, S13)).toContain("V8");
    b.cannotSay = ["Hindmark Bank is a different company, so its results are not about this stock."];
    expect(failing(b, S13)).not.toContain("V8");
  });
  it("fails an invented company-like name", () => {
    const b = goodS01();
    b.cannotSay = ["Whether Sunrise Finance will buy a stake."];
    expect(failing(b)).toContain("V8");
  });
});

describe("V9 risk coverage", () => {
  it("fails when no risk cites news or fundamentals", () => {
    const b = goodS01();
    b.whatCouldGoWrong = [b.whatCouldGoWrong[0]!, { id: "r3", type: "FACT", text: "A typical bad month for this stock was a fall of 6.7%.", sourceIds: ["C21"] }];
    expect(failing(b)).toContain("V9");
  });
});

describe("V10 readability (warning only)", () => {
  it("warns on a long claim but does not fail the brief", () => {
    const b = goodS01();
    b.whatItMightMean[0]!.text =
      "Part of the rise matches other banks and the results may have contributed to the rest, although many other things also happen in a market during a week like this one.";
    const r = validateBrief(b, S01, glossary);
    expect(r.results.find((x) => x.rule === "V10")!.pass).toBe(false);
    expect(r.pass).toBe(true);
  });
});

describe("repair notes", () => {
  it("lists failing rules with paths for the repair prompt", () => {
    const b = goodS01();
    b.whatHappened[0]!.text = "It rose 9.9% because of results.";
    const notes = repairNotes(validateBrief(b, S01, glossary));
    expect(notes).toMatch(/V3/);
    expect(notes).toMatch(/V5/);
    expect(notes).toMatch(/whatHappened\[0\]/);
  });
});
