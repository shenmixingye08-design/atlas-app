import {
  DEFAULT_GROWTH_PATH,
  REVENUE_AGENT_CAMPAIGN_ID,
  REVENUE_UTM_MEDIUM_SOCIAL,
} from "./constants";
import { resolveGrowthDestination } from "./destinations";
import type { RevenueContentKind, RevenuePlatform } from "./types";

export function utmMediumForKind(kind: RevenueContentKind): string {
  return kind === "short_video" ? "video" : REVENUE_UTM_MEDIUM_SOCIAL;
}

export function buildRevenueUtmUrl(input: {
  lpUrl: string;
  platform: RevenuePlatform;
  kind: RevenueContentKind;
  contentId: string;
  campaignId?: string;
  origin?: string;
}): string {
  const campaignId = input.campaignId ?? REVENUE_AGENT_CAMPAIGN_ID;
  const url = resolveGrowthDestination({
    lpUrl: input.lpUrl,
    origin: input.origin,
  });
  url.searchParams.set("utm_source", input.platform);
  url.searchParams.set("utm_medium", utmMediumForKind(input.kind));
  url.searchParams.set("utm_campaign", campaignId);
  url.searchParams.set("utm_content", input.contentId);
  url.searchParams.set("campaignId", campaignId);
  url.searchParams.set("contentId", input.contentId);
  return url.toString();
}

export function buildRevenueTrackingPath(contentId: string): string {
  return `/r/${encodeURIComponent(contentId)}`;
}

export function buildRevenueTrackingUrl(input: {
  origin?: string;
  contentId: string;
}): string {
  const origin = (input.origin ?? "").replace(/\/$/, "");
  const path = buildRevenueTrackingPath(input.contentId);
  if (!origin) return path;
  return `${origin}${path}`;
}

export function parseContentIdFromPath(value: string): string | null {
  const trimmed = value.trim();
  if (!/^ra_[A-Za-z0-9-]+$/.test(trimmed)) return null;
  return trimmed;
}

export { DEFAULT_GROWTH_PATH };
