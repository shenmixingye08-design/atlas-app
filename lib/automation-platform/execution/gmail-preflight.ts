/**
 * Preflight for Automations that include gmail steps.
 * Active/send forbidden unless Production adapter + connection + scopes ready.
 * Draft-only may proceed when compose/modify scope is present.
 */

import "server-only";

import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { validateGmailConnection } from "@/lib/integrations/google/gmail/live/connection";
import type { GmailLiveAction } from "@/lib/integrations/google/gmail/live/types";

export type GmailPreflightIssue = {
  stepId: string;
  errorCode: string;
  message: string;
};

function resolveAction(
  configuration: Readonly<Record<string, unknown>> | undefined,
): GmailLiveAction {
  const raw = String(
    configuration?.action ?? configuration?.mode ?? "draft",
  ).toLowerCase();
  if (raw === "send" || raw === "send_message") return "send";
  if (raw === "reply") return "reply";
  if (raw === "send_draft") return "send_draft";
  return "draft";
}

export async function assertGmailPreflightForActivation(input: {
  userId: string;
  steps: ReadonlyArray<{
    id: string;
    type: string;
    enabled: boolean;
    configuration?: Readonly<Record<string, unknown>>;
  }>;
}): Promise<GmailPreflightIssue[]> {
  const gmailSteps = input.steps.filter(
    (step) => step.enabled && step.type === "gmail",
  );
  if (gmailSteps.length === 0) return [];

  const issues: GmailPreflightIssue[] = [];

  if (!isLiveAdapterWired("google_gmail")) {
    for (const step of gmailSteps) {
      issues.push({
        stepId: step.id,
        errorCode: "live_adapter_missing",
        message: "Gmail Production Adapterが未登録です",
      });
    }
    return issues;
  }

  for (const step of gmailSteps) {
    const action = resolveAction(step.configuration);
    const connection = await validateGmailConnection(input.userId, action);

    if (!connection.ready) {
      // Missing send scope: allow draft-only, forbid active send.
      if (action !== "draft") {
        issues.push({
          stepId: step.id,
          errorCode: "automation_integration_required",
          message:
            connection.health === "missing_scope"
              ? "送信に必要なGmail権限が不足しています。下書きのみに変更するか再接続してください"
              : connection.message ??
                "Gmail連携が connected ではないため有効化できません",
        });
        continue;
      }
      // draft-only with missing connection still blocks activation
      issues.push({
        stepId: step.id,
        errorCode: "automation_integration_required",
        message:
          connection.message ??
          "Gmail連携が connected ではないため有効化できません",
      });
      continue;
    }

    const to = step.configuration?.to;
    const hasTo =
      (typeof to === "string" && to.trim() && to.trim() !== "（宛先未設定）") ||
      (Array.isArray(to) && to.length > 0);
    if (!hasTo) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message: "Gmail宛先（to）が設定されていません",
      });
    }

    if (action === "send" || action === "reply" || action === "send_draft") {
      if (
        step.configuration?.approvalRequired === false ||
        step.configuration?.approvalRequired === "false"
      ) {
        // Explicit opt-out is allowed only for non-production test harness.
        if (process.env.NODE_ENV === "production") {
          issues.push({
            stepId: step.id,
            errorCode: "automation_invalid_definition",
            message: "本番ではGmail送信の承認必須を無効にできません",
          });
        }
      }
    }

    if (action === "reply" && !step.configuration?.replyToMessageId) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message: "返信には replyToMessageId が必要です",
      });
    }
  }

  return issues;
}
