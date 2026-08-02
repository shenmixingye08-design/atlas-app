/**
 * Run lifecycle notifications — policy-aware, deep-link to Review.
 */

import "server-only";

import { createNotification } from "@/lib/notifications/service";
import type { AutomationNotificationPolicy } from "@/lib/automation-platform/types";
import type { AutomationRun } from "@/lib/automation-platform/types/run";

export type RunNotificationEvent =
  | "started"
  | "awaiting_approval"
  | "needs_input"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "retry_started"
  | "retry_finished";

function runActionUrl(run: AutomationRun): string {
  const downloadable = run.artifacts.find(
    (artifact) =>
      artifact.kind === "deliverable" &&
      typeof artifact.url === "string" &&
      artifact.url.trim().length > 0,
  );
  if (downloadable?.url) return downloadable.url;
  return `/automations/runs/${encodeURIComponent(run.id)}`;
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
      return policy.onNeedsInput;
    case "succeeded":
    case "partially_succeeded":
    case "retry_finished":
      return policy.onSuccess;
    case "failed":
    case "retry_started":
      return policy.onFailure;
    default:
      return false;
  }
}

const COPY: Record<
  RunNotificationEvent,
  { title: string; message: (name: string) => string; type: "automation" | "awaiting_review" | "completed" | "error" }
> = {
  started: {
    title: "自動化を開始しました",
    message: (name) => `「${name}」の実行を開始しました。`,
    type: "automation",
  },
  awaiting_approval: {
    title: "ご確認が必要な仕事がございます",
    message: (name) => `「${name}」の実行前確認をお願いいたします。`,
    type: "awaiting_review",
  },
  needs_input: {
    title: "入力が必要な仕事がございます",
    message: (name) => `「${name}」の続行に、追加のご入力が必要です。`,
    type: "awaiting_review",
  },
  succeeded: {
    title: "自動化が終了しました",
    message: (name) => `お待たせいたしました。「${name}」の自動化が終了しました。`,
    type: "completed",
  },
  partially_succeeded: {
    title: "自動化が一部完了しました",
    message: (name) => `「${name}」は一部の手順まで完了しました。内容をご確認ください。`,
    type: "completed",
  },
  failed: {
    title: "処理を完了できませんでした",
    message: (name) => `「${name}」の処理を完了できませんでした。内容をご確認ください。`,
    type: "error",
  },
  retry_started: {
    title: "自動化を再試行します",
    message: (name) => `「${name}」を再試行します。`,
    type: "automation",
  },
  retry_finished: {
    title: "再試行が完了しました",
    message: (name) => `「${name}」の再試行が完了しました。`,
    type: "completed",
  },
};

export function notifyAutomationRunEvent(input: {
  userId: string;
  automationName: string;
  run: AutomationRun;
  policy: AutomationNotificationPolicy;
  event: RunNotificationEvent;
  detail?: string | null;
}): void {
  if (!input.policy.channels.includes("in_app")) return;
  if (!shouldNotify(input.policy, input.event)) return;

  const copy = COPY[input.event];
  const detail = input.detail?.trim();
  try {
    createNotification({
      audience: "user",
      userId: input.userId,
      type: copy.type,
      title: copy.title,
      message: detail
        ? `${copy.message(input.automationName)} ${detail}`
        : copy.message(input.automationName),
      relatedTaskId: input.run.id,
      relatedService: "atlas",
      actionUrl: runActionUrl(input.run),
      automationId: input.run.automationId,
      targetType: "automation_run",
      targetId: input.run.id,
      requestId: input.run.id,
      lineEvent:
        copy.type === "awaiting_review"
          ? "confirmation_request"
          : copy.type === "error"
            ? "error"
            : copy.type === "completed"
              ? "automation_completed"
              : undefined,
    });
  } catch {
    // Notification delivery must never block execution.
  }
}
