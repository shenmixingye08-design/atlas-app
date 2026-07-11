import "server-only";

import {
  estimateTokens,
  type WorkflowCostSummary,
} from "@/lib/ai/cost-meter";
import { decisionToModelPolicy, resolveTaskPolicy } from "@/lib/ai/policy-engine";
import type { AiTaskType } from "@/lib/ai/model-policy";

import { getPlanDefinition } from "../plans/registry";
import type { PlanId } from "../plans/types";
import {
  getUserSubscriptionView,
  isPaidCapableStatus,
} from "../subscriptions/service";

import {
  appendAiUsageEvent,
  getUsageDayKey,
  getUsageMonthKey,
  incrementUsageCounter,
  listAiUsageEvents,
} from "./store";
import type {
  AiUsageApi,
  AiUsageBreakdown,
  AiUsageEvent,
  AiUsagePeriodSummary,
} from "./types";

function emptyPeriod(): AiUsagePeriodSummary {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}

function addToPeriod(
  target: AiUsagePeriodSummary,
  event: AiUsageEvent,
): void {
  target.requests += event.requestCount;
  target.inputTokens += event.inputTokens;
  target.outputTokens += event.outputTokens;
  target.totalTokens += event.totalTokens;
  target.estimatedCostUsd += event.estimatedCostUsd;
}

function resolveEffectivePlanId(userId: string): PlanId {
  const subscription = getUserSubscriptionView(userId);
  if (subscription.planId === "free") return "free";
  if (isPaidCapableStatus(subscription.status)) return subscription.planId;
  return "free";
}

function estimateCostUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  aiTaskType?: AiTaskType;
}): number {
  const policy = decisionToModelPolicy(
    resolveTaskPolicy(input.aiTaskType ?? "chat"),
  );
  // Prefer policy pricing; model string is recorded separately for reporting.
  void input.model;
  return (
    (input.inputTokens / 1_000_000) * policy.inputPricePerMillion +
    (input.outputTokens / 1_000_000) * policy.outputPricePerMillion
  );
}

export type RecordUserAiUsageInput = {
  userId: string;
  api: AiUsageApi;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number;
  requestCount?: number;
  planId?: PlanId;
  timestamp?: string;
  aiTaskType?: AiTaskType;
};

/**
 * Records one user-facing AI run against plan quota (`aiRuns`) and the detail ledger.
 * Reuses {@link incrementUsageCounter} — do not invent a second counter path.
 */
export function recordUserAiUsage(input: RecordUserAiUsageInput): AiUsageEvent {
  const requestCount = Math.max(1, input.requestCount ?? 1);
  const inputTokens = Math.max(0, Math.round(input.inputTokens));
  const outputTokens = Math.max(0, Math.round(input.outputTokens));
  const totalTokens = inputTokens + outputTokens;
  const planId = input.planId ?? resolveEffectivePlanId(input.userId);
  const estimatedCostUsd =
    input.estimatedCostUsd ??
    estimateCostUsd({
      model: input.model,
      inputTokens,
      outputTokens,
      aiTaskType: input.aiTaskType,
    });

  incrementUsageCounter(input.userId, "aiRuns", requestCount);

  return appendAiUsageEvent({
    id: `aiu_${crypto.randomUUID()}`,
    userId: input.userId,
    planId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    model: input.model || getPlanDefinition(planId).name,
    api: input.api,
    feature: input.feature,
    requestCount,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: Math.max(0, estimatedCostUsd),
  });
}

export function recordUserAiUsageFromTexts(input: {
  userId: string;
  api: AiUsageApi;
  feature: string;
  model: string;
  inputText: string;
  outputText: string;
  instructions?: string;
  aiTaskType?: AiTaskType;
  estimatedCostUsd?: number;
}): AiUsageEvent {
  const inputTokens =
    estimateTokens(input.inputText) + estimateTokens(input.instructions ?? "");
  const outputTokens = estimateTokens(input.outputText);
  return recordUserAiUsage({
    userId: input.userId,
    api: input.api,
    feature: input.feature,
    model: input.model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: input.estimatedCostUsd,
    aiTaskType: input.aiTaskType,
  });
}

/** One plan-quota run from an orchestration / automation cost summary. */
export function recordUserAiUsageFromCostSummary(input: {
  userId: string;
  api: AiUsageApi;
  feature: string;
  summary: WorkflowCostSummary;
}): AiUsageEvent {
  const primaryModel =
    input.summary.calls.find((call) => !call.cached)?.model ??
    input.summary.calls[0]?.model ??
    "unknown";

  return recordUserAiUsage({
    userId: input.userId,
    api: input.api,
    feature: input.feature,
    model: primaryModel,
    inputTokens: input.summary.estimatedInputTokens,
    outputTokens: input.summary.estimatedOutputTokens,
    estimatedCostUsd: input.summary.estimatedCostUsd,
  });
}

export function summarizeAiUsageEvents(
  events: readonly AiUsageEvent[],
  now: Date = new Date(),
): AiUsageBreakdown {
  const todayKey = getUsageDayKey(now);
  const monthKey = getUsageMonthKey(now);
  const breakdown: AiUsageBreakdown = {
    today: emptyPeriod(),
    month: emptyPeriod(),
    allTime: emptyPeriod(),
    byModel: {},
    byFeature: {},
  };

  for (const event of events) {
    const day = event.timestamp.slice(0, 10);
    const month = event.timestamp.slice(0, 7);
    addToPeriod(breakdown.allTime, event);
    if (month === monthKey) addToPeriod(breakdown.month, event);
    if (day === todayKey) addToPeriod(breakdown.today, event);

    const modelBucket = (breakdown.byModel[event.model] ??= emptyPeriod());
    addToPeriod(modelBucket, event);
    const featureBucket = (breakdown.byFeature[event.feature] ??= emptyPeriod());
    addToPeriod(featureBucket, event);
  }

  return breakdown;
}

export function getUserAiUsageBreakdown(userId: string): AiUsageBreakdown {
  return summarizeAiUsageEvents(listAiUsageEvents(userId));
}

export { resolveEffectivePlanId as resolveUsagePlanId };
