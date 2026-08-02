import type { AutomationRun } from "@/lib/automation-platform/types";
import { describeNeedsInput } from "./needs-input";
import { formatRunStatus, formatStepStatus } from "./status-labels";

export type FailureUserView = {
  headline: string;
  failedStepName: string | null;
  failedAt: string | null;
  userCause: string;
  temporality: "transient" | "permanent" | "unknown";
  retryCount: number;
  autoRecoverable: boolean;
  needsInput: boolean;
  needsReconnect: boolean;
  affectedArtifacts: Array<{ id: string; label: string; url: string | null }>;
  succeededSteps: Array<{ id: string; name: string }>;
  technical: {
    userCode: string | null;
    diagnosticId: string;
    requestId: string;
    failedStage: string | null;
    retryCount: number;
  };
};

function classifyTemporality(run: AutomationRun): FailureUserView["temporality"] {
  const code = (run.lastErrorCode ?? "").toLowerCase();
  if (
    /timeout|rate|temporar|network|503|429|unavailable/.test(code) ||
    run.retryable
  ) {
    return "transient";
  }
  if (
    /permission|invalid|unauthorized|not_found|disabled|conflict/.test(code)
  ) {
    return "permanent";
  }
  return "unknown";
}

/**
 * Build a user-safe failure presentation. Technical fields stay under `technical`.
 */
export function buildFailureUserView(run: AutomationRun): FailureUserView {
  const failedStep = run.steps.find((step) => step.id === run.failedStepId);
  const succeededSteps = run.steps
    .filter((step) => step.status === "succeeded")
    .map((step) => ({ id: step.id, name: step.name }));

  const needsInput = run.needsUserInput || run.status === "needs_input";
  const needsReconnect = /integration|reconnect|token|oauth|unauthorized/i.test(
    `${run.lastErrorCode ?? ""} ${run.lastErrorMessage ?? ""}`,
  );

  let headline: string;
  if (run.status === "partially_succeeded") {
    const failedName = failedStep?.name ?? "一部の手順";
    headline = `成果物作成は進みましたが、「${failedName}」で止まりました`;
  } else if (needsInput) {
    headline = describeNeedsInput(run);
  } else {
    headline = failedStep
      ? `「${failedStep.name}」で失敗しました`
      : "実行に失敗しました";
  }

  const userCause = needsInput
    ? describeNeedsInput(run)
    : (run.lastErrorMessage ?? "原因を特定できませんでした。詳細診断をご確認ください");

  return {
    headline,
    failedStepName: failedStep?.name ?? null,
    failedAt: failedStep?.completedAt ?? run.completedAt,
    userCause,
    temporality: classifyTemporality(run),
    retryCount: Math.max(0, run.attemptCount - 1),
    autoRecoverable: Boolean(run.retryable && run.nextRetryAt),
    needsInput,
    needsReconnect,
    affectedArtifacts: run.artifacts.map((artifact) => ({
      id: artifact.id,
      label: artifact.label,
      url: artifact.url,
    })),
    succeededSteps,
    technical: {
      userCode: run.lastErrorCode,
      diagnosticId: run.diagnosticId,
      requestId: run.id,
      failedStage: failedStep
        ? `${failedStep.name} (${formatStepStatus(failedStep.status)})`
        : formatRunStatus(run.status),
      retryCount: Math.max(0, run.attemptCount - 1),
    },
  };
}
