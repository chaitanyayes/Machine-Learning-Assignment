import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateAll, registrySource, serialisePriceFile } from "@/scripts/generator/generate";
import { generatePath } from "@/scripts/generator/engine";
import { createRng } from "@/scripts/generator/prng";

const root = process.cwd();

describe("price generator", () => {
  it("is deterministic", () => {
    const a = generateAll();
    const b = generateAll();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("matches the committed files byte for byte (run npm run generate:prices after changing targets)", () => {
    const data = generateAll();
    for (const [ticker, file] of Object.entries(data.prices)) {
      expect(readFileSync(join(root, "data/prices", `${ticker}.json`), "utf8")).toBe(serialisePriceFile(file));
    }
    for (const [id, file] of Object.entries(data.indices)) {
      expect(readFileSync(join(root, "data/indices", `${id}.json`), "utf8")).toBe(serialisePriceFile(file));
    }
    expect(readFileSync(join(root, "lib/data/seriesRegistry.ts"), "utf8")).toBe(registrySource(data));
  });

  it("different seeds give different streams", () => {
    expect(createRng("a")()).not.toBe(createRng("b")());
  });

  it("hits anchors exactly and keeps noise between them", () => {
    const path = generatePath({
      id: "T",
      start: "2026-01-05",
      end: "2026-03-30",
      refDate: "2026-03-30",
      refPrice: 100,
      annualVol: 0.3,
      anchors: [
        { date: "2026-01-05", rel: 0.8 },
        { date: "2026-02-16", rel: 1.2 },
      ],
      seed: "test",
    });
    const at = (d: string) => path.prices[path.dates.indexOf(d)]!;
    expect(at("2026-01-05")).toBeCloseTo(80, 8);
    expect(at("2026-02-16")).toBeCloseTo(120, 8);
    expect(at("2026-03-30")).toBeCloseTo(100, 8);
    // Not a straight line between anchors.
    const mid = at("2026-01-27");
    const linear = 80 * Math.pow(120 / 80, 0.5);
    expect(Math.abs(mid - linear)).toBeGreaterThan(1e-6);
  });

  it("rejects anchors that are not trading days", () => {
    expect(() =>
      generatePath({
        id: "T",
        start: "2026-01-05",
        end: "2026-02-27",
        refDate: "2026-02-27",
        refPrice: 100,
        annualVol: 0.2,
        anchors: [{ date: "2026-01-26", rel: 1 }], // Republic Day
        seed: "x",
      }),
    ).toThrow(/not a trading day/);
  });
});
