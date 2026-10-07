import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, resetRateLimits, take } from "@/lib/safety/rateLimit";

describe("rate limit", () => {
  beforeEach(() => resetRateLimits());
  const limit = { capacity: 2, windowMs: 60_000 };

  it("allows up to capacity, then refuses with a retry time", () => {
    expect(take("a", limit, 0).ok).toBe(true);
    expect(take("a", limit, 0).ok).toBe(true);
    const third = take("a", limit, 0);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSeconds).toBe(30);
  });

  it("refills over time and keys are independent", () => {
    take("a", limit, 0);
    take("a", limit, 0);
    expect(take("b", limit, 0).ok).toBe(true);
    expect(take("a", limit, 30_000).ok).toBe(true);
  });

  it("reads the first forwarded IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
