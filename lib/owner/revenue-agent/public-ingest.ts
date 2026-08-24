import { resolveClientIp } from "@/lib/contact/service";
import { consumeDistributedRateLimit } from "@/lib/http/rate-limit";

import {
  applyVisitTouch,
  attributedLastTouch,
  touchFromParams,
} from "./attribution";
import { REVENUE_AGENT_CAMPAIGN_ID } from "./constants";
import { ensureRevenueAgentHydrated } from "./durable";
import { clickDedupeKey } from "./events";
import { recordRevenueEvent } from "./record";
import { getRevenueItem, getRevenueVisitor, upsertRevenueVisitor } from "./store";
import { parseContentIdFromPath } from "./utm";

export async function rateLimitGrowthIngest(request: Request): Promise<{
  allowed: boolean;
  retryAfterMs?: number;
}> {
  const ip = resolveClientIp(request);
  const result = await consumeDistributedRateLimit(ip, {
    bucket: "growth-ingest",
    max: 60,
    windowMs: 60 * 60 * 1000,
    minIntervalMs: 250,
  });
  return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
}

export async function recordAttributedClick(input: {
  contentId: string;
  visitorId: string;
  source?: string | null;
  medium?: string | null;
  campaignId?: string | null;
}): Promise<{ counted: boolean; reason?: string }> {
  await ensureRevenueAgentHydrated();
  const contentId = parseContentIdFromPath(input.contentId);
  if (!contentId) return { counted: false, reason: "invalid_content" };

  const item = getRevenueItem(contentId);
  if (!item) return { counted: false, reason: "unknown_content" };
  if (item.status !== "published") {
    return { counted: false, reason: "not_published" };
  }

  const now = new Date().toISOString();
  const existing = getRevenueVisitor(input.visitorId);
  const touch = touchFromParams({
    campaignId: input.campaignId ?? item.campaignId ?? REVENUE_AGENT_CAMPAIGN_ID,
    contentId,
    source: input.source ?? item.platform,
    medium: input.medium ?? "social",
    at: now,
  });
  const visitor = applyVisitTouch(
    existing ? { ...existing, visitorId: input.visitorId } : {
      visitorId: input.visitorId,
      firstTouch: null,
      lastTouch: null,
      createdAt: now,
      updatedAt: now,
    },
    touch,
    now,
  );
  visitor.visitorId = input.visitorId;
  upsertRevenueVisitor(visitor);

  const { inserted } = recordRevenueEvent({
    eventName: "link_clicked",
    dedupeKey: clickDedupeKey(contentId, input.visitorId),
    anonymousVisitorId: input.visitorId,
    campaignId: touch.campaignId,
    contentId,
    source: touch.source,
    medium: touch.medium,
  });

  return { counted: inserted };
}

export async function captureUtmVisit(input: {
  visitorId: string;
  contentId?: string | null;
  campaignId?: string | null;
  source?: string | null;
  medium?: string | null;
}): Promise<{ counted: boolean; reason?: string }> {
  if (!input.contentId) {
    return { counted: false, reason: "organic_unattributed" };
  }
  return recordAttributedClick({
    contentId: input.contentId,
    visitorId: input.visitorId,
    source: input.source,
    medium: input.medium,
    campaignId: input.campaignId,
  });
}

export { attributedLastTouch };
