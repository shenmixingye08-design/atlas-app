import "server-only";

import { recordActivationEvent } from "./service";
import type {
  ActivationEventName,
  ActivationGoalId,
  FirstSuccessKind,
  OAuthFailureReason,
} from "./types";

type ObserveInput = {
  userId: string | null | undefined;
  event: ActivationEventName;
  idempotencyKey: string;
  sourcePage?: string | null;
  selectedGoal?: ActivationGoalId | null;
  jobType?: string | null;
  success?: boolean | null;
  diagnosticId?: string | null;
  plan?: string | null;
  firstSuccessKind?: FirstSuccessKind;
};

export function observeActivation(input: ObserveInput): void {
  const userId = input.userId?.trim();
  if (!userId || !input.idempotencyKey.trim()) return;
  void recordActivationEvent({
    ...input,
    userId,
  }).catch(() => undefined);
}

export function observeFirstRequestSubmitted(
  userId: string,
  jobId: string,
): void {
  observeActivation({
    userId,
    event: "first_request_submitted",
    idempotencyKey: `first_request_submitted:${jobId}`,
    sourcePage: "/workspace",
    jobType: "work_request",
    success: true,
  });
}

export function observeFirstRequestCompleted(
  userId: string,
  input: { requestId?: string | null; deliverableId?: string | null },
): void {
  if (!input.deliverableId) return;
  observeActivation({
    userId,
    event: "first_request_completed",
    idempotencyKey: `first_request_completed:${input.deliverableId}`,
    sourcePage: "/projects",
    jobType: "work_request",
    success: true,
  });
}

export function observeFirstResultViewed(
  userId: string,
  notificationId: string,
  deliverableId?: string | null,
): void {
  if (!deliverableId) return;
  observeActivation({
    userId,
    event: "first_result_viewed",
    idempotencyKey: `first_result_viewed:${notificationId}`,
    sourcePage: "/results",
    jobType: "work_request",
    success: true,
    firstSuccessKind: "request_completed_viewed",
  });
}

export function observeFirstArtifactDownloaded(
  userId: string,
  deliverableId: string,
): void {
  observeActivation({
    userId,
    event: "first_artifact_downloaded",
    idempotencyKey: `first_artifact_downloaded:${deliverableId}`,
    sourcePage: "/deliverables",
    jobType: "deliverable",
    success: true,
    firstSuccessKind: "artifact_opened",
  });
}

export function observeXDraftCreated(userId: string, draftId: string): void {
  observeActivation({
    userId,
    event: "first_x_draft_created",
    idempotencyKey: `first_x_draft_created:${draftId}`,
    sourcePage: "/workspace/x",
    jobType: "x_draft",
    success: true,
    firstSuccessKind: "x_draft_reviewed",
  });
}

export function observeXScheduled(userId: string, scheduledId: string): void {
  observeActivation({
    userId,
    event: "first_x_post_scheduled",
    idempotencyKey: `first_x_post_scheduled:${scheduledId}`,
    sourcePage: "/workspace/x",
    jobType: "x_scheduled",
    success: true,
    firstSuccessKind: "x_post_scheduled",
  });
}

export function observeXPublished(userId: string, historyId: string): void {
  observeActivation({
    userId,
    event: "first_x_post_published",
    idempotencyKey: `first_x_post_published:${historyId}`,
    sourcePage: "/workspace/x",
    jobType: "x_published",
    success: true,
    firstSuccessKind: "x_post_published",
  });
}

export function observeAutomationCreated(
  userId: string,
  automationId: string,
): void {
  observeActivation({
    userId,
    event: "first_automation_created",
    idempotencyKey: `first_automation_created:${automationId}`,
    sourcePage: "/automations",
    jobType: "automation",
    success: true,
  });
}

export function observeAutomationRunSucceeded(
  userId: string,
  automationId: string,
): void {
  observeActivation({
    userId,
    event: "first_automation_run_completed",
    idempotencyKey: `first_automation_run_completed:${automationId}`,
    sourcePage: "/automations",
    jobType: "automation",
    success: true,
    firstSuccessKind: "automation_run_succeeded",
  });
}

export function observeCalendarLiveSuccess(
  userId: string,
  eventId: string,
): void {
  observeActivation({
    userId,
    event: "first_request_completed",
    idempotencyKey: `calendar_live:${eventId}`,
    sourcePage: "/workspace",
    jobType: "google_calendar",
    success: true,
    firstSuccessKind: "calendar_live_succeeded",
  });
}

export function observeIntegration(
  userId: string,
  service: "x" | "google",
  stage: "started" | "connected" | "failed",
  reason?: OAuthFailureReason,
): void {
  const event =
    stage === "started"
      ? "integration_started"
      : stage === "connected"
        ? "integration_connected"
        : "integration_failed";
  observeActivation({
    userId,
    event,
    idempotencyKey: `${event}:${service}:${userId}:${reason ?? "ok"}`,
    sourcePage: service === "x" ? "/workspace/x" : "/settings",
    jobType: service,
    success: stage !== "failed",
    diagnosticId: reason ?? null,
  });
}

export function observeCheckoutStarted(userId: string, plan: string): void {
  observeActivation({
    userId,
    event: "checkout_started",
    idempotencyKey: `checkout_started:${userId}:${plan}`,
    sourcePage: "/settings/billing",
    plan,
    success: true,
  });
}

export function observeSubscriptionActivated(
  userId: string,
  plan: string,
): void {
  observeActivation({
    userId,
    event: "subscription_activated",
    idempotencyKey: `subscription_activated:${userId}:${plan}`,
    sourcePage: "/billing/success",
    plan,
    success: true,
  });
}
