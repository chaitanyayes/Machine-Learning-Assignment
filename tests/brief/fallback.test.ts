import { describe, expect, it } from "vitest";
import { fallbackBrief } from "@/lib/brief/fallback";
import { validateBrief } from "@/lib/brief/validate";
import { buildContextPack, isUnavailable } from "@/lib/contextPack/build";
import { glossary, scenarios } from "@/lib/data/load";

describe("deterministic fallback brief", () => {
  for (const s of scenarios) {
    it(`${s.id}: passes every error-level validator rule and uses only FACT claims`, () => {
      const pack = buildContextPack(s.id);
      if (isUnavailable(pack)) throw new Error("unavailable");
      const brief = fallbackBrief(pack);
      const report = validateBrief(brief, pack, glossary);
      const failing = report.results.filter((r) => !r.pass && r.severity === "error");
      expect(failing.map((r) => `${r.rule}: ${r.detail}`)).toEqual([]);
      const claims = [...brief.whatHappened, ...brief.whatItMightMean, ...brief.whatCouldGoWrong, ...brief.conflicts];
      expect(claims.every((c) => c.type === "FACT")).toBe(true);
    });
  }
});
