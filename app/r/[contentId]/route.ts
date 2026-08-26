import { NextResponse } from "next/server";

import { DEFAULT_GROWTH_PATH } from "@/lib/owner/revenue-agent/constants";
import { resolveGrowthDestination } from "@/lib/owner/revenue-agent/destinations";
import {
  rateLimitGrowthIngest,
  recordAttributedClick,
} from "@/lib/owner/revenue-agent/public-ingest";
import { ensureRevenueAgentHydrated } from "@/lib/owner/revenue-agent/durable";
import { getRevenueGoals, getRevenueItem } from "@/lib/owner/revenue-agent/store";
import { buildRevenueUtmUrl, parseContentIdFromPath } from "@/lib/owner/revenue-agent/utm";
import { ensureVisitorIdCookie } from "@/lib/owner/revenue-agent/visitor-cookie";
import { getSiteOrigin } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ contentId: string }> };

export async function GET(request: Request, context: Ctx): Promise<Response> {
  const limited = await rateLimitGrowthIngest(request);
  if (!limited.allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: limited.retryAfterMs
        ? { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) }
        : undefined,
    });
  }

  const { contentId: rawId } = await context.params;
  const contentId = parseContentIdFromPath(rawId);
  const origin = getSiteOrigin();
  const fallback = new URL(DEFAULT_GROWTH_PATH, `${origin}/`);

  if (!contentId) {
    return NextResponse.redirect(fallback, 302);
  }

  await ensureRevenueAgentHydrated();
  const item = getRevenueItem(contentId);
  const goals = getRevenueGoals();
  const destination = item
    ? buildRevenueUtmUrl({
        lpUrl: item.signupPath || goals.lpUrl || DEFAULT_GROWTH_PATH,
        platform: item.platform,
        kind: item.kind,
        contentId,
        campaignId: item.campaignId,
        origin,
      })
    : resolveGrowthDestination({
        lpUrl: DEFAULT_GROWTH_PATH,
        origin,
      }).toString();

  const visitorId = await ensureVisitorIdCookie();
  await recordAttributedClick({
    contentId,
    visitorId,
    source: item?.platform ?? "x",
    medium: "social",
    campaignId: item?.campaignId,
  });

  return NextResponse.redirect(destination, 302);
}
