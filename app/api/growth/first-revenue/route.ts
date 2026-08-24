import { auth } from "@clerk/nextjs/server";

import { recordOfferEvent } from "@/lib/growth/first-revenue/service";
import { rateLimitGrowthIngest } from "@/lib/owner/revenue-agent/public-ingest";
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
  const visitorId = await ensureVisitorIdCookie();
  const { userId } = await auth();
  const action = typeof body.action === "string" ? body.action : "";
  const contentId = typeof body.contentId === "string" ? body.contentId : null;

  if (action === "view") {
    await recordOfferEvent({ eventName: "offer_lp_viewed", visitorId, contentId });
    return Response.json({ ok: true });
  }
  if (action === "cta") {
    await recordOfferEvent({ eventName: "offer_cta_clicked", visitorId, contentId });
    return Response.json({ ok: true });
  }
  if (action === "first_use_started" && userId) {
    return Response.json(await recordOfferEvent({ eventName: "first_use_started", userId, visitorId }));
  }
  if (action === "first_use_succeeded" && userId) {
    return Response.json(await recordOfferEvent({ eventName: "first_use_succeeded", userId, visitorId }));
  }
  if (action === "first_use_failed" && userId) {
    return Response.json(await recordOfferEvent({ eventName: "first_use_failed", userId, visitorId }));
  }
  if (action === "upgrade_viewed" && userId) {
    return Response.json(await recordOfferEvent({ eventName: "upgrade_viewed", userId, visitorId }));
  }
  return Response.json({ error: "未知の操作です" }, { status: 400 });
}
