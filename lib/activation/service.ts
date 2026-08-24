import "server-only";

import { getUsageMonthKey } from "@/lib/billing/usage/period";
import { getUsageSnapshot } from "@/lib/billing/usage/store";
import { resolveEffectivePlanId } from "@/lib/billing/policy";

import { buildActivationChecklist, nextActivationHref } from "./checklist";
import { persistActivationNow, ensureActivationHydrated } from "./durable";
import { insertActivationEventRow } from "./events-table";
import { getRecommendedGoalId, listAvailableGoals } from "./goals";
import { toSafeEventPayload } from "./privacy";
import {
  hasActivationIdempotencyKey,
  listActivationEvents,
  readActivationProgress,
  rememberActivationEvent,
  writeActivationProgress,
} from "./store";
import { resolveTrialPolicy } from "./trial-policy";
import type {
  ActivationDraftInputs,
  ActivationEventName,
  ActivationEventPayload,
  ActivationGoalId,
  ActivationPhase,
  ActivationProgress,
  DeviceCategory,
  FirstSuccessKind,
} from "./types";

const FIRST_EVENTS = new Set<ActivationEventName>([
  "sign_up_completed",
  "first_request_submitted",
  "first_request_completed",
  "first_result_viewed",
  "first_artifact_downloaded",
  "first_automation_created",
  "first_automation_run_completed",
  "first_x_draft_created",
  "first_x_post_scheduled",
  "first_x_post_published",
  "subscription_activated",
]);

const SUCCESS_EVENTS: Partial<Record<ActivationEventName, FirstSuccessKind>> = {
  first_result_viewed: "request_completed_viewed",
  first_artifact_downloaded: "artifact_opened",
  first_x_draft_created: "x_draft_reviewed",
  first_x_post_scheduled: "x_post_scheduled",
  first_x_post_published: "x_post_published",
  first_automation_run_completed: "automation_run_succeeded",
};

function nowIso(): string {
  return new Date().toISOString();
}

export function createDefaultProgress(
  userId: string,
  planId: string | null,
): ActivationProgress {
  const at = nowIso();
  return {
    version: 1,
    userId,
    phase: "new_signup",
    selectedGoal: null,
    recommendedGoal: getRecommendedGoalId(planId),
    draftInputs: {},
    currentStep: "goal",
    milestones: {},
    checklistHidden: false,
    paywallShownAfterSuccess: false,
    legacyUser: false,
    registeredAt: at,
    updatedAt: at,
  };
}

function inferLegacyUser(userId: string): boolean {
  try {
    const usage = getUsageSnapshot(userId, getUsageMonthKey());
    if (
      (usage.aiRuns ?? 0) > 0 ||
      (usage.snsPosts ?? 0) > 0 ||
      (usage.automationTasksActive ?? 0) > 0
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function getOrCreateActivationProgress(
  userId: string,
): Promise<ActivationProgress> {
  await ensureActivationHydrated(userId);
  const existing = readActivationProgress(userId);
  if (existing) return existing;

  const planId = resolveEffectivePlanId(userId);
  const progress = createDefaultProgress(userId, planId);
  if (inferLegacyUser(userId)) {
    progress.legacyUser = true;
    progress.phase = "completed";
    progress.checklistHidden = true;
    progress.currentStep = null;
  }
  writeActivationProgress(userId, progress);
  await persistActivationNow(userId).catch(() => undefined);
  if (!progress.legacyUser) {
    await recordActivationEvent({
      userId,
      event: "sign_up_completed",
      idempotencyKey: `sign_up_completed:${userId}`,
      sourcePage: "/projects",
      success: true,
    });
  }
  return readActivationProgress(userId) ?? progress;
}

export async function recordActivationEvent(input: {
  userId: string;
  event: ActivationEventName;
  idempotencyKey: string;
  sourcePage?: string | null;
  selectedGoal?: ActivationGoalId | null;
  jobType?: string | null;
  success?: boolean | null;
  diagnosticId?: string | null;
  plan?: string | null;
  deviceCategory?: DeviceCategory;
  appVersion?: string | null;
  firstSuccessKind?: FirstSuccessKind;
}): Promise<{ recorded: boolean; event: ActivationEventPayload | null }> {
  await ensureActivationHydrated(input.userId);
  const key = input.idempotencyKey.slice(0, 120);
  if (hasActivationIdempotencyKey(input.userId, key)) {
    return { recorded: false, event: null };
  }

  const progress =
    readActivationProgress(input.userId) ??
    (await getOrCreateActivationProgress(input.userId));

  if (FIRST_EVENTS.has(input.event) && progress.milestones[input.event]) {
    return { recorded: false, event: null };
  }

  const event = toSafeEventPayload({
    event: input.event,
    userId: input.userId,
    idempotencyKey: key,
    sourcePage: input.sourcePage ?? null,
    selectedGoal: input.selectedGoal ?? progress.selectedGoal,
    jobType: input.jobType ?? null,
    success: input.success ?? null,
    diagnosticId: input.diagnosticId ?? null,
    plan: input.plan ?? null,
    deviceCategory: input.deviceCategory,
    appVersion: input.appVersion ?? null,
  });

  const inserted = rememberActivationEvent(input.userId, event);
  if (!inserted) return { recorded: false, event: null };

  const next: ActivationProgress = {
    ...progress,
    milestones: {
      ...progress.milestones,
      [input.event]: event.occurredAt,
    },
    updatedAt: event.occurredAt,
  };

  const successKind =
    input.firstSuccessKind ?? SUCCESS_EVENTS[input.event] ?? null;
  if (successKind && !next.milestones.firstSuccessAt) {
    next.milestones.firstSuccessAt = event.occurredAt;
    next.milestones.firstSuccessKind = successKind;
    if (next.phase !== "skipped") next.phase = "completed";
  }

  if (input.event === "onboarding_started" && next.phase === "new_signup") {
    next.phase = "in_progress";
  }
  if (input.event === "onboarding_skipped") {
    next.phase = "skipped";
  }
  if (input.event === "onboarding_completed") {
    next.phase = "completed";
  }
  if (input.event === "goal_selected" && input.selectedGoal) {
    next.selectedGoal = input.selectedGoal;
    next.phase = next.phase === "new_signup" ? "in_progress" : next.phase;
  }

  writeActivationProgress(input.userId, next);
  void persistActivationNow(input.userId).catch(() => undefined);
  void insertActivationEventRow(event).catch(() => undefined);
  return { recorded: true, event };
}

export async function updateActivationProgress(
  userId: string,
  patch: {
    selectedGoal?: ActivationGoalId | null;
    draftInputs?: ActivationDraftInputs;
    currentStep?: string | null;
    phase?: ActivationPhase;
    checklistHidden?: boolean;
    paywallShownAfterSuccess?: boolean;
  },
): Promise<ActivationProgress> {
  const current = await getOrCreateActivationProgress(userId);
  const next: ActivationProgress = {
    ...current,
    selectedGoal:
      patch.selectedGoal !== undefined ? patch.selectedGoal : current.selectedGoal,
    draftInputs: { ...current.draftInputs, ...patch.draftInputs },
    currentStep:
      patch.currentStep !== undefined ? patch.currentStep : current.currentStep,
    phase: patch.phase ?? current.phase,
    checklistHidden: patch.checklistHidden ?? current.checklistHidden,
    paywallShownAfterSuccess:
      patch.paywallShownAfterSuccess ?? current.paywallShownAfterSuccess,
    updatedAt: nowIso(),
  };
  if (next.legacyUser && patch.phase !== "in_progress") {
    writeActivationProgress(userId, current);
    return current;
  }
  writeActivationProgress(userId, next);
  await persistActivationNow(userId).catch(() => undefined);
  return next;
}

export async function getActivationView(userId: string) {
  const progress = await getOrCreateActivationProgress(userId);
  const planId = resolveEffectivePlanId(userId);
  const trial = resolveTrialPolicy();
  return {
    progress,
    checklist: buildActivationChecklist(progress),
    nextHref: nextActivationHref(progress),
    goals: listAvailableGoals(planId),
    recommendedGoal: getRecommendedGoalId(planId),
    trial,
    planId,
    shouldShowOnboarding:
      !progress.legacyUser &&
      (progress.phase === "new_signup" ||
        (progress.phase === "in_progress" && !progress.selectedGoal)),
    shouldShowResume:
      !progress.legacyUser &&
      progress.phase === "in_progress" &&
      Boolean(progress.selectedGoal),
    shouldShowChecklist:
      !progress.legacyUser &&
      !progress.checklistHidden &&
      progress.phase !== "completed",
  };
}

export function listUserActivationEvents(userId: string): ActivationEventPayload[] {
  return listActivationEvents(userId);
}
