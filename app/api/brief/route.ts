import { NextResponse, type NextRequest } from "next/server";
import { serveBrief } from "@/lib/brief/serve";
import { scenarios } from "@/lib/data/load";
import { liveAvailable } from "@/lib/llm/server";
import { clientIp, LIMITS, take } from "@/lib/safety/rateLimit";

// GET  /api/brief?scenario=S01[&feed=unavailable]  → the brief for a scenario (cached or live per BRIEF_MODE)
// POST /api/brief { scenario, feed? }               → regenerate live (Reviewer panel; needs a key; rate limited)

function scenarioParam(value: unknown): string | null {
  return typeof value === "string" && scenarios.some((s) => s.id === value) ? value : null;
}

function feedParam(value: unknown): "unavailable" | undefined {
  return value === "unavailable" ? "unavailable" : undefined;
}

export async function GET(request: NextRequest) {
  const scenario = scenarioParam(request.nextUrl.searchParams.get("scenario"));
  if (!scenario) return NextResponse.json({ error: "Unknown scenario" }, { status: 400 });
  const served = await serveBrief(scenario, { feed: feedParam(request.nextUrl.searchParams.get("feed")) });
  return NextResponse.json({ ...served, liveAvailable: liveAvailable() });
}

export async function POST(request: NextRequest) {
  if (!liveAvailable()) {
    return NextResponse.json({ error: "Live generation needs ANTHROPIC_API_KEY on the server." }, { status: 503 });
  }
  const limit = take(`brief:${clientIp(request.headers)}`, LIMITS.briefLive);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many live requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  let body: { scenario?: unknown; feed?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const scenario = scenarioParam(body.scenario);
  if (!scenario) return NextResponse.json({ error: "Unknown scenario" }, { status: 400 });
  const served = await serveBrief(scenario, { feed: feedParam(body.feed), forceLive: true });
  return NextResponse.json({ ...served, liveAvailable: true });
}
