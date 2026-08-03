/**
 * Preflight for Automations that include wordpress steps.
 * Publish forbidden unless Production adapter + connection ready.
 * Draft/update may proceed when connected.
 */

import "server-only";

import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { validateWordPressConnection } from "@/lib/integrations/wordpress/live/connection";

export type WordPressPreflightIssue = {
  stepId: string;
  errorCode: string;
  message: string;
};

function resolveAction(
  configuration: Readonly<Record<string, unknown>> | undefined,
): string {
  const publishMode = String(configuration?.publishMode ?? "").toLowerCase();
  if (publishMode === "publish") return "publish";
  if (publishMode === "draft") return "draft";
  return String(
    configuration?.action ?? configuration?.mode ?? "draft",
  ).toLowerCase();
}

export async function assertWordPressPreflightForActivation(input: {
  userId: string;
  steps: ReadonlyArray<{
    id: string;
    type: string;
    enabled: boolean;
    configuration?: Readonly<Record<string, unknown>>;
  }>;
}): Promise<WordPressPreflightIssue[]> {
  const wpSteps = input.steps.filter(
    (step) => step.enabled && step.type === "wordpress",
  );
  if (wpSteps.length === 0) return [];

  const issues: WordPressPreflightIssue[] = [];

  if (!isLiveAdapterWired("wordpress")) {
    for (const step of wpSteps) {
      issues.push({
        stepId: step.id,
        errorCode: "live_adapter_missing",
        message: "WordPress Production Adapterが未登録です",
      });
    }
    return issues;
  }

  const connection = await validateWordPressConnection(input.userId);
  if (!connection.ready) {
    for (const step of wpSteps) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_integration_required",
        message:
          connection.message ??
          "WordPress連携が connected ではないため有効化できません",
      });
    }
    return issues;
  }

  for (const step of wpSteps) {
    const action = resolveAction(step.configuration);
    const title =
      typeof step.configuration?.title === "string"
        ? step.configuration.title.trim()
        : "";
    const content =
      typeof step.configuration?.content === "string"
        ? step.configuration.content.trim()
        : typeof step.configuration?.body === "string"
          ? step.configuration.body.trim()
          : "";
    if (!title || !content) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message: "WordPressのタイトルと本文が設定されていません",
      });
    }

    if (action === "publish") {
      if (
        step.configuration?.approvalRequired === false ||
        step.configuration?.approvalRequired === "false"
      ) {
        if (process.env.NODE_ENV === "production") {
          issues.push({
            stepId: step.id,
            errorCode: "automation_invalid_definition",
            message: "本番ではWordPress公開の承認必須を無効にできません",
          });
        }
      }
    }

    if (action === "update") {
      const postId = step.configuration?.postId ?? step.configuration?.wordpressPostId;
      const hasPostId =
        (typeof postId === "number" && postId > 0) ||
        (typeof postId === "string" && postId.trim().length > 0);
      if (!hasPostId) {
        issues.push({
          stepId: step.id,
          errorCode: "automation_invalid_definition",
          message: "更新には postId が必要です",
        });
      }
    }
  }

  return issues;
}
