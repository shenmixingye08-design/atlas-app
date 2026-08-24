import { DEFAULT_GROWTH_PATH, REVENUE_AGENT_CAMPAIGN_ID } from "./constants";
import { findForbiddenClaim } from "./claims";
import {
  defaultRevenueGoals,
  emptyMetrics,
  unknownMetricSources,
} from "./defaults";
import type { RevenueContent } from "./types";
import { buildRevenueTrackingPath, buildRevenueUtmUrl } from "./utm";

export function normalizeRevenueContent(item: RevenueContent): RevenueContent {
  const campaignId = item.campaignId || item.campaign || REVENUE_AGENT_CAMPAIGN_ID;
  const contentId = item.contentId || item.id;
  const hit = findForbiddenClaim(
    [item.title, item.hook, item.body, item.cta].filter(Boolean).join("\n"),
    defaultRevenueGoals(),
  );
  return {
    ...item,
    campaign: campaignId,
    campaignId,
    contentId,
    painPoint: item.painPoint ?? "",
    intent: item.intent ?? item.reason ?? "",
    featureExample: item.featureExample ?? "",
    signupPath: item.signupPath || DEFAULT_GROWTH_PATH,
    claimCheck: item.claimCheck ?? {
      ok: !hit,
      hits: hit ? [hit] : [],
    },
    trackingUrl: item.trackingUrl || buildRevenueTrackingPath(contentId),
    utmUrl:
      item.utmUrl ||
      buildRevenueUtmUrl({
        lpUrl: item.signupPath || DEFAULT_GROWTH_PATH,
        platform: item.platform,
        kind: item.kind,
        contentId,
        campaignId,
      }),
    failedStage: item.failedStage ?? null,
    retryable: item.retryable ?? item.status === "failed",
    metrics: item.metrics ?? emptyMetrics(),
    metricSource: item.metricSource ?? unknownMetricSources(),
  };
}
