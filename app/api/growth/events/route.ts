import { isPublicGrowthEventName } from "@/lib/owner/revenue-agent/events";
import {
  captureUtmVisit,
  rateLimitGrowthIngest,
} from "@/lib/owner/revenue-agent/public-ingest";
import { ensureVisitorIdCookie } from "@/lib/owner/revenue-agent/visitor-cookie";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const limited = await rateLimitGrowthIngest(request);
  if (!limited.allowed) {
    return Response.json({ error: "Too Many Requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isPublicGrowthEventName(body.eventName)) {
    return Response.json({ error: "Event not allowed" }, { status: 400 });
  }

  const contentId = typeof body.contentId === "string" ? body.contentId : null;
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : null;
  const source = typeof body.source === "string" ? body.source : null;
  const medium = typeof body.medium === "string" ? body.medium : null;

  const visitorId = await ensureVisitorIdCookie();
  const result = await captureUtmVisit({
    visitorId,
    contentId,
    campaignId,
    source,
    medium,
  });

  return Response.json({
    ok: true,
    counted: result.counted,
    reason: result.reason ?? null,
  });
}
