import { afterEach, describe, expect, it } from "vitest";
import { briefMode, serveBrief } from "@/lib/brief/serve";

describe("serving briefs", () => {
  const saved = { mode: process.env.BRIEF_MODE, key: process.env.ANTHROPIC_API_KEY };
  afterEach(() => {
    process.env.BRIEF_MODE = saved.mode;
    process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.mode === undefined) delete process.env.BRIEF_MODE;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
  });

  it("is cached by default and stays cached when live is requested without a key", () => {
    delete process.env.BRIEF_MODE;
    expect(briefMode()).toBe("cached");
    process.env.BRIEF_MODE = "live";
    delete process.env.ANTHROPIC_API_KEY;
    expect(briefMode()).toBe("cached");
  });

  it("serves a validated brief for every stock scenario with no key, and nothing when the feed is down", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const served = await serveBrief("S01");
    expect(served.unavailable).toBeFalsy();
    if (!served.unavailable) {
      expect(served.result.validation.pass).toBe(true);
      expect(served.pack.scenarioId).toBe("S01");
    }
    expect((await serveBrief("S11", { feed: "unavailable" })).unavailable).toBe(true);
  });
});
