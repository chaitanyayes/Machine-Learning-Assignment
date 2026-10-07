import { describe, it, expect } from "vitest";
import { FRESHNESS } from "@/lib/config";
import { newsAge } from "@/lib/compute/freshness";

const AS_OF = "2026-07-24";

describe("newsAge", () => {
  it("news dated on asOf is 0 days old and fresh", () => {
    expect(newsAge(AS_OF, AS_OF)).toEqual({ ageDays: 0, isStale: false });
  });

  it("is still fresh at exactly the threshold (30 days)", () => {
    // 24 Jun → 24 Jul = 6 days left in June + 24 in July = 30.
    expect(newsAge("2026-06-24", AS_OF)).toEqual({ ageDays: 30, isStale: false });
  });

  it("is stale one day past the threshold (31 days)", () => {
    // 23 Jun → 24 Jul = 7 + 24 = 31 > 30.
    expect(newsAge("2026-06-23", AS_OF)).toEqual({ ageDays: 31, isStale: true });
  });

  it("uses the configured default threshold", () => {
    expect(FRESHNESS.staleAfterDays).toBe(30);
  });

  it("counts calendar days across months and a leap day", () => {
    // S06's order win: 20 Mar → 24 Jul 2026 = 11 (Mar) + 30 + 31 + 30 + 24 = 126.
    expect(newsAge("2026-03-20", AS_OF)).toEqual({ ageDays: 126, isStale: true });
    // 28 Feb 2024 → 1 Mar 2024 crosses 29 Feb: 2 days.
    expect(newsAge("2024-02-28", "2024-03-01").ageDays).toBe(2);
  });

  it("accepts an override threshold", () => {
    // 10 days old: stale against 7, fresh against 10.
    expect(newsAge("2026-07-14", AS_OF, 7)).toEqual({ ageDays: 10, isStale: true });
    expect(newsAge("2026-07-14", AS_OF, 10)).toEqual({ ageDays: 10, isStale: false });
    // A threshold of 0 makes anything older than today stale.
    expect(newsAge("2026-07-23", AS_OF, 0).isStale).toBe(true);
    expect(newsAge(AS_OF, AS_OF, 0).isStale).toBe(false);
  });

  it("throws for news dated after asOf", () => {
    expect(() => newsAge("2026-07-25", AS_OF)).toThrow(/after asOf/);
  });

  it("throws for malformed dates", () => {
    expect(() => newsAge("24-07-2026", AS_OF)).toThrow(/Not an ISO date/);
    expect(() => newsAge(AS_OF, "")).toThrow(/Not an ISO date/);
  });
});
