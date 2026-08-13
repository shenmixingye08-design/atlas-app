/**
 * Run lifecycle notifications — policy-aware, deep-link to Review.
 * partially_succeeded is NEVER treated as completed.
 */

import "server-only";

import { createNotification } from "@/lib/notifications/service";
import type { AutomationNotificationPolicy } from "@/lib/automation-platform/types";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import type { PushEventCategory } from "@/lib/push/types";

import {
  buildAutomationRunNotifyCopy,
  type RunNotificationEvent,
} from "./notify-copy";

export type { RunNotificationEvent };

function runActionUrl(run: AutomationRun): string {
  return `/automations/runs/${encodeURIComponent(run.id)}`;
}

function policyAllowsNotify(policy: AutomationNotificationPolicy): boolean {
  return policy.channels.some(
    (channel) =>
      channel === "in_app" || channel === "web_push" || channel === "line",
  );
}

function shouldNotify(
  policy: AutomationNotificationPolicy,
  event: RunNotificationEvent,
): boolean {
  switch (event) {
    case "started":
      return policy.beforeRun;
    case "awaiting_approval":
    case "needs_input":
    case "prepared":
      return policy.onNeedsInput;
    case "succeeded":
    case "retry_finished":
      return policy.onSuccess;
    case "partially_succeeded":
      // Partial completion needs user attention — not a success channel.
      return policy.onNeedsInput || policy.onFailure;
    case "failed":
    case "retry_started":
      return policy.onFailure;
    default:
      return false;
  }
}

function notificationTypeFor(
  event: RunNotificationEvent,
): "automation" | "awaiting_review" | "completed" | "error" {
  switch (event) {
    case "awaiting_approval":
    case "needs_input":
    case "prepared":
    case "partially_succeeded":
      return "awaiting_review";
    case "succeeded":
    case "retry_finished":
      return "completed";
    case "failed":
      return "error";
    default:
      return "automation";
  }
}

function eventCategoryFor(event: RunNotificationEvent): PushEventCategory {
  switch (event) {
    case "succeeded":
    case "retry_finished":
      return "final_success";
    case "failed":
      return "final_failure";
    case "awaiting_approval":
    case "needs_input":
    case "prepared":
    case "partially_succeeded":
      return "approval_needed";
    case "started":
      return "job_start";
    case "retry_started":
      return "mid_retry";
    default:
      return "internal_step";
  }
}

export function buildRunNotificationEventVersion(
  event: RunNotificationEvent,
): string {
  return `run:${event}`;
}

export async function notifyAutomationRunEvent(input: {
  userId: string;
  automationName: string;
  run: AutomationRun;
  policy: AutomationNotificationPolicy;
  event: RunNotificationEvent;
  detail?: string | null;
}): Promise<void> {
  if (!policyAllowsNotify(input.policy)) return;
  if (!shouldNotify(input.policy, input.event)) return;

  const type = notificationTypeFor(input.event);
  const copy = buildAutomationRunNotifyCopy({
    event: input.event,
    automationName: input.automationName,
    run: input.run,
    detail: input.detail,
  });
  try {
    await createNotification(
      {
        audience: "user",
        userId: input.userId,
        type,
        title: copy.title,
        message: copy.message,
        relatedTaskId: input.run.id,
        relatedService: "atlas",
        actionUrl: runActionUrl(input.run),
        automationId: input.run.automationId,
        targetType: "automation_run",
        targetId: input.run.id,
        requestId: input.run.id,
        jobName: input.automationName,
        eventCategory: eventCategoryFor(input.event),
        lineEvent:
          type === "awaiting_review"
            ? "confirmation_request"
            : type === "error"
              ? "error"
              : type === "completed"
                ? "automation_completed"
                : undefined,
      },
      { eventVersion: buildRunNotificationEventVersion(input.event) },
    );
  } catch {
    // Durable create failure must not crash the automation runner; caller may
    // still observe missing notification via inbox checks / job evidence.
  }
}
