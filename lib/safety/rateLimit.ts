// Simple per-IP token bucket, held in memory. On serverless platforms each
// instance has its own memory, so this is a cost brake for a public link, not
// a guarantee (README → Limitations).

export type Limit = { capacity: number; windowMs: number };

export const LIMITS = {
  ask: { capacity: 20, windowMs: 10 * 60_000 },
  briefLive: { capacity: 5, windowMs: 10 * 60_000 },
  evalsLive: { capacity: 1, windowMs: 10 * 60_000 },
} as const satisfies Record<string, Limit>;

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Takes one token. Returns whether the request may proceed and, if not, how long to wait. */
export function take(key: string, limit: Limit, now = Date.now()): { ok: boolean; retryAfterSeconds: number } {
  const refillPerMs = limit.capacity / limit.windowMs;
  const b = buckets.get(key) ?? { tokens: limit.capacity, updated: now };
  b.tokens = Math.min(limit.capacity, b.tokens + (now - b.updated) * refillPerMs);
  b.updated = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    buckets.set(key, b);
    return { ok: true, retryAfterSeconds: 0 };
  }
  buckets.set(key, b);
  return { ok: false, retryAfterSeconds: Math.ceil((1 - b.tokens) / refillPerMs / 1000) };
}

export function resetRateLimits(): void {
  buckets.clear();
}
