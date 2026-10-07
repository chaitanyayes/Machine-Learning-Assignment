import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isTradingDay } from "@/lib/compute/calendar";
import { assertValidSeries } from "@/lib/compute/series";
import {
  companies,
  corporateActions,
  dataStatus,
  fundamentals,
  indices,
  scenarios,
} from "@/lib/data/load";
import { PriceFile } from "@/lib/data/schemas";
import { SNAPSHOT } from "@/lib/config";

const root = process.cwd();

function readPriceFiles(dir: string): PriceFile[] {
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => PriceFile.parse(JSON.parse(readFileSync(join(root, dir, f), "utf8"))));
}

describe("data files", () => {
  it("every company is fictional, uniquely identified and points at a known sector index", () => {
    const ids = new Set(companies.map((c) => c.id));
    const tickers = new Set(companies.map((c) => c.ticker));
    expect(ids.size).toBe(companies.length);
    expect(tickers.size).toBe(companies.length);
    for (const c of companies) {
      expect(c.isFictional).toBe(true);
      expect(indices.some((i) => i.id === c.sectorIndexId && i.kind === "sector")).toBe(true);
      for (const s of c.siblings ?? []) expect(ids.has(s.id)).toBe(true);
    }
  });

  it("siblings are declared on both sides", () => {
    for (const c of companies) {
      for (const s of c.siblings ?? []) {
        const other = companies.find((x) => x.id === s.id);
        expect(other?.siblings?.some((x) => x.id === c.id)).toBe(true);
      }
    }
  });

  it("has exactly one market index and every index is simulated", () => {
    expect(indices.filter((i) => i.kind === "market")).toHaveLength(1);
    expect(indices.every((i) => i.isSimulated)).toBe(true);
  });

  it("scenarios S01–S15 exist, point at known companies and sit on trading days", () => {
    expect(scenarios.map((s) => s.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`),
    );
    for (const s of scenarios) {
      expect(companies.some((c) => c.id === s.companyId)).toBe(true);
      expect(isTradingDay(s.asOf)).toBe(true);
      if (s.surface === "holding") {
        expect(s.holding).toBeDefined();
        expect(isTradingDay(s.holding!.buyDate)).toBe(true);
      }
    }
  });

  it("every edge case 1–7, 12–15 and 17 is owned by at least one scenario", () => {
    const covered = new Set(scenarios.flatMap((s) => s.edgeCaseIds));
    for (const ec of [1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15, 17]) expect(covered.has(ec)).toBe(true);
  });

  it("every company has data status, fundamentals and a price file", () => {
    const priceIds = new Set(readPriceFiles("data/prices").map((p) => p.id));
    for (const c of companies) {
      expect(dataStatus.filter((d) => d.companyId === c.id)).toHaveLength(1);
      expect(fundamentals.filter((f) => f.companyId === c.id)).toHaveLength(1);
      expect(priceIds.has(c.ticker)).toBe(true);
    }
  });

  it("price and index files are valid, on trading days, and never run past the latest snapshot", () => {
    for (const file of [...readPriceFiles("data/prices"), ...readPriceFiles("data/indices")]) {
      assertValidSeries({ id: file.id, points: file.closes });
      for (const c of file.closes) expect(isTradingDay(c.date)).toBe(true);
      expect(file.closes.at(-1)!.date <= SNAPSHOT.T1).toBe(true);
    }
  });

  it("corporate actions belong to known companies and bonus/split actions carry a multiplier", () => {
    for (const a of corporateActions) {
      expect(companies.some((c) => c.id === a.companyId)).toBe(true);
      if (a.type === "dividend") expect(a.shareMultiplier).toBeNull();
      else expect(a.shareMultiplier).not.toBeNull();
    }
  });

  it("the delayed company's price file stops at its data-status date", () => {
    const delayed = dataStatus.filter((d) => d.status === "delayed");
    expect(delayed.length).toBeGreaterThan(0);
    for (const d of delayed) {
      const ticker = companies.find((c) => c.id === d.companyId)!.ticker;
      const file = readPriceFiles("data/prices").find((p) => p.id === ticker)!;
      expect(file.closes.at(-1)!.date).toBe(d.asOf);
    }
  });
});
