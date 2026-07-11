import { formatOwnerMonthKey, formatOwnerMonthLabel } from "../format";
import { buildEstimatedFeatureMetrics } from "./defaults";
import {
  getPopularityFeatureDefinition,
  POPULARITY_FEATURE_IDS,
} from "./registry";
import { listPopularityUsageEvents } from "./store";
import type {
  PopularityFeatureId,
  PopularityFeatureMetrics,
  PopularityRankingSnapshot,
  PopularityUsageEvent,
} from "./types";

function getPreviousMonthKey(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 2, 1);
  return formatOwnerMonthKey(date);
}

function filterEventsByMonth(
  events: readonly PopularityUsageEvent[],
  monthKey: string,
): PopularityUsageEvent[] {
  return events.filter((event) => event.timestamp.startsWith(monthKey));
}

function aggregateFeatureMetrics(
  featureId: PopularityFeatureId,
  events: readonly PopularityUsageEvent[],
): { activeUsers: number; usageCount: number } {
  const featureEvents = events.filter((event) => event.featureId === featureId);
  const userIds = new Set(
    featureEvents
      .map((event) => event.userId)
      .filter((userId): userId is string => Boolean(userId)),
  );

  return {
    activeUsers: userIds.size,
    usageCount: featureEvents.length,
  };
}

function computeMomChangePercent(
  currentUsage: number,
  previousUsage: number,
): number | null {
  if (previousUsage === 0) {
    return currentUsage > 0 ? 100 : null;
  }

  return Math.round(((currentUsage - previousUsage) / previousUsage) * 100);
}

function buildFeatureMetrics(
  featureId: PopularityFeatureId,
  currentEvents: readonly PopularityUsageEvent[],
  previousEvents: readonly PopularityUsageEvent[],
  now: Date,
  useEstimatedFallback: boolean,
): PopularityFeatureMetrics {
  const definition = getPopularityFeatureDefinition(featureId);

  if (useEstimatedFallback) {
    const estimated = buildEstimatedFeatureMetrics(featureId, now);
    return {
      featureId,
      label: definition.label,
      activeUsers: estimated.activeUsers,
      usageCount: estimated.usageCount,
      momChangePercent: computeMomChangePercent(
        estimated.usageCount,
        estimated.previousUsageCount,
      ),
      rank: 0,
      isEstimated: true,
    };
  }

  const current = aggregateFeatureMetrics(featureId, currentEvents);
  const previous = aggregateFeatureMetrics(featureId, previousEvents);

  return {
    featureId,
    label: definition.label,
    activeUsers: current.activeUsers,
    usageCount: current.usageCount,
    momChangePercent: computeMomChangePercent(
      current.usageCount,
      previous.usageCount,
    ),
    rank: 0,
    isEstimated: false,
  };
}

export function buildPopularityRankingSnapshot(
  now: Date = new Date(),
): PopularityRankingSnapshot {
  const monthKey = formatOwnerMonthKey(now);
  const previousMonthKey = getPreviousMonthKey(monthKey);
  const events = listPopularityUsageEvents();
  const useEstimatedFallback = false;
  const currentEvents = filterEventsByMonth(events, monthKey);
  const previousEvents = filterEventsByMonth(events, previousMonthKey);

  const previousMonthDate = new Date(
    Number(previousMonthKey.slice(0, 4)),
    Number(previousMonthKey.slice(5, 7)) - 1,
    1,
  );

  const metrics = POPULARITY_FEATURE_IDS.map((featureId) =>
    buildFeatureMetrics(
      featureId,
      currentEvents,
      previousEvents,
      now,
      useEstimatedFallback,
    ),
  );

  const sorted = [...metrics].sort((a, b) => b.usageCount - a.usageCount);
  const rankings = sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  return {
    period: {
      month: monthKey,
      monthLabel: formatOwnerMonthLabel(now),
      previousMonth: previousMonthKey,
      previousMonthLabel: formatOwnerMonthLabel(previousMonthDate),
    },
    rankings,
    generatedAt: now.toISOString(),
  };
}
