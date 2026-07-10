import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { listUserSubscriptions } from "@/lib/billing/subscriptions/store";
import { getFeatureFlagDefinition } from "@/lib/feature-flags/registry";
import { listFeatureFlagRecords } from "@/lib/feature-flags/store";

import { buildEstimatedBetaUserMetrics } from "./defaults";
import { listBetaUserEntries } from "./emails";
import type {
  BetaFeatureEntry,
  BetaUserManagementSnapshot,
} from "./types";

function listBetaFeatures(): BetaFeatureEntry[] {
  return listFeatureFlagRecords()
    .filter((record) => record.state === "beta")
    .map((record) => {
      const definition = getFeatureFlagDefinition(record.id);
      return {
        featureId: record.id,
        label: definition.label,
        category: definition.category,
      };
    });
}

function computeParticipationRate(
  betaCount: number,
  totalCount: number,
): number | null {
  if (totalCount <= 0) return null;
  return Math.round((betaCount / totalCount) * 1000) / 10;
}

export function buildBetaUserManagementSnapshot(
  now: Date = new Date(),
): BetaUserManagementSnapshot {
  const betaUsers = listBetaUserEntries();
  const betaFeatures = listBetaFeatures();
  const hasLiveBillingData = listUserSubscriptions().length > 0;
  const useEstimatedFallback = !hasLiveBillingData && betaUsers.length === 0;
  const billing = getOwnerBillingMetrics();

  if (useEstimatedFallback) {
    const estimated = buildEstimatedBetaUserMetrics();
    return {
      betaParticipantCount: estimated.betaParticipantCount,
      generalUserCount: estimated.generalUserCount,
      totalUserCount: estimated.totalUserCount,
      participationRatePercent: estimated.participationRatePercent,
      betaFeatures,
      betaUsers: [],
      isEstimated: true,
      generatedAt: now.toISOString(),
    };
  }

  const totalUserCount = billing.paidSubscribers + billing.freeSubscribers;
  const betaParticipantCount = betaUsers.length;
  const generalUserCount = Math.max(0, totalUserCount - betaParticipantCount);

  return {
    betaParticipantCount,
    generalUserCount,
    totalUserCount,
    participationRatePercent: computeParticipationRate(
      betaParticipantCount,
      totalUserCount,
    ),
    betaFeatures,
    betaUsers,
    isEstimated: false,
    generatedAt: now.toISOString(),
  };
}
