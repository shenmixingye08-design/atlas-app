import "server-only";

import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { getUserUsageLimitSummary } from "@/lib/billing/usage/service";
import { getUsageMonthKey, serializeUsageSnapshots } from "@/lib/billing/usage/store";
import { resolveUserSubscription } from "@/lib/billing/subscriptions/service";

import { ensureRevenueMaxHydrated, persistRevenueMax } from "./durable";
import { resolveLifecycleState } from "./lifecycle";
import { buildMeasuredValueView, previousUsageMonthKey } from "./measured";
import {
  applyFirstFail,
  applyFirstRequest,
  applyFirstSuccess,
  applyOnboardingStarted,
  applyUsecaseSelected,
  recordUserEvent,
} from "./record";
import { getRevenueMaxState, setRevenueMaxState } from "./store";
import type {
  CheckoutFailClass,
  FirstUsecaseId,
  PainChoice,
  RevenueMaxEventName,
} from "./types";
import { REVENUE_MAX_EVENT_NAMES } from "./types";
import { buildContextualUpgrade, classifyUpgradeTrigger } from "./upgrade";
import { timeToFirstMs } from "./usecases";
import { shouldShowCheckoutResume } from "./checkout";
import { stickyVariant } from "./experiments";

export async function getRevenueMaxSnapshot(userId: string) {
  await ensureRevenueMaxHydrated(userId);
  const state = getRevenueMaxState(userId);
  const subscription = resolveUserSubscription(userId);
  const usage = getUserUsageLimitSummary(userId);
  const ai = usage.aiRuns;
  const trigger = classifyUpgradeTrigger({
    used: ai.used,
    limit: ai.limit,
    meterId: "aiRuns",
  });
  const lifecycle = resolveLifecycleState({
    state,
    planId: subscription.planId,
    subscriptionStatus: subscription.status,
    lastValueAt: state.lastValueAt ?? state.firstSuccessAt,
    hadPaid: state.hadPaid,
    previousPaid: subscription.status === "canceled",
  });
  const upgradeRaw = buildContextualUpgrade({
    currentPlanId: subscription.planId,
    trigger,
    meterId: "aiRuns",
    used: ai.used,
    limit: ai.limit,
    dismissedAt: state.upgradeDismissedAt,
  });
  const upgrade =
    lifecycle === "paid_at_risk" ? { ...upgradeRaw, show: false } : upgradeRaw;

  const month = getUsageMonthKey();
  const prevMonth = previousUsageMonthKey(month);
  const snapshots = serializeUsageSnapshots();
  const prevKey = prevMonth ? `${userId}:${prevMonth}` : null;
  const prevSnapshot = prevKey ? snapshots[prevKey] : undefined;

  return {
    state,
    lifecycle,
    upgrade,
    measured: buildMeasuredValueView({
      usage,
      previousMonthKnown: Boolean(prevSnapshot),
      previousMonthAiRuns: prevSnapshot?.aiRuns ?? null,
    }),
    resumeCheckout: shouldShowCheckoutResume({
      checkoutOutcome: state.checkoutOutcome,
      resumeShownAt: state.resumeShownAt,
      planId: subscription.planId,
    }),
    remainingAi:
      usage.ready !== false && Number.isFinite(ai.limit)
        ? { used: ai.used, limit: ai.limit, remaining: Math.max(0, ai.limit - ai.used) }
        : null,
    timeToFirstRequestMs: timeToFirstMs(state.onboardingStartedAt, state.firstRequestAt),
    timeToFirstValueMs: timeToFirstMs(state.onboardingStartedAt, state.firstSuccessAt),
    planName: getPlanDefinition(subscription.planId).name,
  };
}

export async function handleRevenueMaxAction(
  userId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureRevenueMaxHydrated(userId);
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "onboarding_started") {
    applyOnboardingStarted(userId);
  } else if (action === "first_usecase_selected") {
    const pain = body.pain as PainChoice;
    const usecase = body.usecase as FirstUsecaseId;
    if (!pain || !usecase) return { ok: false, error: "pain と usecase が必要です" };
    applyUsecaseSelected(userId, pain, usecase);
  } else if (action === "first_request_started") {
    applyFirstRequest(userId, (body.usecase as FirstUsecaseId) ?? "sns");
  } else if (action === "first_request_succeeded") {
    applyFirstSuccess(userId, String(body.summary ?? "初回の仕事が完了しました"));
  } else if (action === "first_request_failed") {
    applyFirstFail(userId, String(body.message ?? "失敗"));
  } else if (action === "upgrade_viewed") {
    recordUserEvent({
      userId,
      eventName: "upgrade_viewed",
      dedupeKey: `upgrade_viewed:${userId}:${String(body.planId ?? "none")}`,
      metadata: { planId: String(body.planId ?? "") },
    });
  } else if (action === "upgrade_dismissed") {
    const current = getRevenueMaxState(userId);
    setRevenueMaxState({
      ...current,
      upgradeDismissedAt: new Date().toISOString(),
    });
  } else if (action === "checkout_abandoned") {
    recordUserEvent({
      userId,
      eventName: "checkout_abandoned",
      dedupeKey: `checkout_abandoned:${userId}:${getRevenueMaxState(userId).checkoutSessionId ?? "na"}`,
      patch: { checkoutOutcome: "abandoned" },
    });
  } else if (action === "checkout_failed") {
    const failClass = (body.failClass as CheckoutFailClass) ?? "unknown";
    recordUserEvent({
      userId,
      eventName: "checkout_failed",
      dedupeKey: `checkout_failed:${userId}:${failClass}:${String(body.message ?? "").slice(0, 20)}`,
      metadata: { failClass },
      patch: { checkoutOutcome: "failed", checkoutFailClass: failClass },
    });
  } else if (action === "checkout_completed") {
    recordUserEvent({
      userId,
      eventName: "checkout_completed",
      dedupeKey: `checkout_completed:${userId}:${String(body.sessionId ?? "na")}`,
      patch: { checkoutOutcome: "completed", hadPaid: true },
    });
  } else if (action === "cancellation_completed") {
    recordUserEvent({
      userId,
      eventName: "cancellation_completed",
      dedupeKey: `cancellation_completed:${userId}:${String(body.subscriptionId ?? "na")}`,
    });
  } else if (action === "subscription_reactivated") {
    recordUserEvent({
      userId,
      eventName: "subscription_reactivated",
      dedupeKey: `subscription_reactivated:${userId}:${String(body.sessionId ?? "na")}`,
      patch: { hadPaid: true, checkoutOutcome: "completed" },
    });
  } else if (action === "resume_shown") {
    const current = getRevenueMaxState(userId);
    setRevenueMaxState({ ...current, resumeShownAt: new Date().toISOString() });
  } else if (action === "at_risk_shown") {
    const current = getRevenueMaxState(userId);
    setRevenueMaxState({ ...current, atRiskShownAt: new Date().toISOString() });
  } else if (action === "cancellation_started") {
    recordUserEvent({
      userId,
      eventName: "cancellation_started",
      dedupeKey: `cancellation_started:${userId}:${Date.now()}`,
    });
  } else if (action === "cancellation_reason_selected") {
    recordUserEvent({
      userId,
      eventName: "cancellation_reason_selected",
      dedupeKey: `cancellation_reason:${userId}:${String(body.reasonId ?? "")}`,
      metadata: { reasonId: String(body.reasonId ?? "") },
    });
  } else if (action === "cancellation_abandoned") {
    recordUserEvent({
      userId,
      eventName: "cancellation_abandoned",
      dedupeKey: `cancellation_abandoned:${userId}:${Date.now()}`,
    });
  } else if (action === "experiment_expose") {
    const experimentId = String(body.experimentId ?? "onboarding_usecase");
    const current = getRevenueMaxState(userId);
    const variant = stickyVariant(current.variants[experimentId], userId, experimentId);
    recordUserEvent({
      userId,
      eventName: "experiment_exposed",
      dedupeKey: `experiment_exposed:${userId}:${experimentId}`,
      metadata: { experimentId, variant },
      patch: { variants: { ...current.variants, [experimentId]: variant } },
    });
  } else {
    return { ok: false, error: "未知の操作です" };
  }

  await persistRevenueMax(userId);
  return { ok: true };
}

export function isRevenueMaxEventName(value: string): value is RevenueMaxEventName {
  return (REVENUE_MAX_EVENT_NAMES as readonly string[]).includes(value);
}
