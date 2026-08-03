/**
 * Controlled E2E harness helpers — never invents live external success.
 * Local deliverable steps use the real generator/storage path.
 */

import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { invokeDeliverableStep } from "@/lib/automation-platform/execution/deliverable-step";
import {
  estimateStepCost,
  recordAutomationRunCost,
} from "@/lib/automation-platform/cost/run-cost";

export type E2EVerdict = "pass" | "fail" | "blocked";

export type E2EEvidence = {
  scenarioId: string;
  automationId?: string;
  runId?: string;
  requestId?: string;
  diagnosticId?: string;
  occurrenceKey?: string | null;
  artifactIds?: string[];
  externalActionIds?: string[];
  approvalId?: string | null;
  notificationIds?: string[];
  durationMs?: number;
  estimatedUsd?: number;
  verdict: E2EVerdict;
  reason?: string;
  maskedLogs?: string[];
};

function artifact(
  label: string,
  kind: AutomationRunArtifact["kind"],
  externalId: string | null = null,
  url: string | null = null,
): AutomationRunArtifact {
  return {
    id: crypto.randomUUID(),
    kind,
    label,
    url,
    externalId,
    createdAt: new Date().toISOString(),
  };
}

const DELIVERABLE_TYPES = new Set([
  "word_generate",
  "excel_generate",
  "pdf_generate",
  "powerpoint_generate",
  "deliverable_generate",
]);

/**
 * Controlled invoker for platform mechanics tests.
 * - Document steps → real generator + storage (no placeholder URL)
 * - External steps NEVER succeed unless explicitly overridden and tagged
 */
export function createControlledInvoker(options?: {
  /** Map capability -> behavior for mechanics tests only */
  externalBehavior?: Partial<
    Record<
      string,
      "fail" | "needs_input" | "controlled_success" | "transient_fail_once"
    >
  >;
  failOnceKeys?: Set<string>;
}): StepInvoker {
  const failOnce = options?.failOnceKeys ?? new Set<string>();
  return async (input) => {
    const { step, approved } = input;
    const capability = getCapability(step.type);
    if (!capability) {
      return {
        ok: false,
        summary: "unsupported",
        artifacts: [],
        errorCode: "step_not_implemented",
        errorMessage: step.type,
        failedStage: "STEP_DISPATCH",
        retryable: false,
      };
    }
    if (capability.systemRequiresApproval && !approved) {
      return {
        ok: false,
        summary: "承認が必要です",
        artifacts: [],
        errorCode: "automation_approval_required",
        errorMessage: "高リスク手順は承認後のみ実行できます",
        needsUserInput: true,
        failedStage: "APPROVAL",
        retryable: false,
      };
    }

    const external = new Set([
      "gmail",
      "x_post",
      "dropbox",
      "wordpress",
      "google_calendar",
    ]);

    if (external.has(step.type)) {
      const behavior = options?.externalBehavior?.[step.type] ?? "fail";
      if (behavior === "needs_input") {
        return {
          ok: false,
          summary: "メール送信先が設定されていません",
          artifacts: [],
          errorCode: "automation_integration_required",
          errorMessage: "メール送信先が設定されていません",
          needsUserInput: true,
          failedStage: "EXTERNAL_INPUT",
          retryable: false,
        };
      }
      if (behavior === "transient_fail_once") {
        const key = `${input.runId}:${step.id}`;
        if (!failOnce.has(key)) {
          failOnce.add(key);
          return {
            ok: false,
            summary: "一時的な外部障害",
            artifacts: [],
            errorCode: "automation_timeout",
            errorMessage: "upstream 503",
            failedStage: "EXTERNAL_CALL",
            retryable: true,
          };
        }
      }
      if (behavior === "controlled_success") {
        const externalId = `ctrl:${step.id}:${input.runId}`;
        const completedAt = new Date().toISOString();
        const url = `controlled://external/${encodeURIComponent(externalId)}`;
        // Provider-shaped evidence fragments satisfy External Completion Gate
        // for mechanics tests (not Live API success).
        const providerEvidence =
          step.type === "gmail"
            ? {
                gmail: {
                  service: "gmail" as const,
                  action: "send",
                  draftId: null,
                  messageId: externalId,
                  threadId: null,
                  recipientHash: "controlled",
                  subjectHash: "controlled",
                  attachmentArtifactIds: [] as string[],
                  completedAt,
                  resultHash: externalId,
                  retryCount: 0,
                  duplicatePrevented: false,
                  adapterMode: "production",
                  environment: "test",
                  approvalId: null,
                  providerRequestId: null,
                  deliveryGuarantee: "provider_accepted" as const,
                },
              }
            : step.type === "dropbox"
              ? {
                  dropbox: {
                    service: "dropbox" as const,
                    fileId: externalId,
                    pathDisplay: "/controlled/file.bin",
                    rev: "rev_controlled",
                    size: 1,
                    contentHash: "controlled",
                    targetPath: "/controlled",
                    fileName: "file.bin",
                    sharedLinkUrl: url,
                    completedAt,
                    resultHash: externalId,
                    retryCount: 0,
                    duplicatePrevented: false,
                  },
                }
              : step.type === "wordpress"
                ? {
                    wordpress: {
                      service: "wordpress" as const,
                      action: "draft",
                      postId: 1,
                      postStatus: "draft",
                      link: url,
                      editLink: url,
                      titleHash: "controlled",
                      contentHash: "controlled",
                      mediaArtifactIds: [] as string[],
                      mediaIds: [] as number[],
                      completedAt,
                      resultHash: externalId,
                      retryCount: 0,
                      duplicatePrevented: false,
                      adapterMode: "production",
                      environment: "test",
                      approvalId: null,
                      providerRequestId: null,
                    },
                  }
                : step.type === "google_calendar"
                  ? {
                      calendar: {
                        service: "google_calendar" as const,
                        action: "create",
                        calendarId: "primary",
                        eventId: externalId,
                        htmlLink: url,
                        hangoutLink: null,
                        startDateTime: completedAt,
                        endDateTime: completedAt,
                        timezone: "UTC",
                        attendeeHash: "controlled",
                        completedAt,
                        resultHash: externalId,
                        retryCount: 0,
                        duplicatePrevented: false,
                        adapterMode: "production",
                        environment: "test",
                        approvalId: null,
                        providerRequestId: null,
                      },
                    }
                  : {};
        return {
          ok: true,
          summary: `controlled_external:${step.type}`,
          artifacts: [
            artifact(
              `controlled:${step.type}`,
              "external",
              externalId,
              url,
            ),
          ],
          evidence: {
            externalActionIds: [externalId],
            externalUrls: [url],
            artifactIds: [],
            storageObjectIds: [],
            notificationIds: [],
            adapterMode: "production",
            environment: "test",
            ...providerEvidence,
          },
        };
      }
      return {
        ok: false,
        summary: `${step.type}は未接続/ライブ未実行のため成功扱いしません`,
        artifacts: [],
        errorCode: "live_adapter_missing",
        errorMessage: "external_not_live",
        failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
        retryable: false,
      };
    }

    if (DELIVERABLE_TYPES.has(step.type)) {
      return invokeDeliverableStep(input);
    }

    if (step.type === "notify") {
      const id = `ctrl_notify_${input.runId}_${step.id}`;
      return {
        ok: true,
        summary: "通知（controlled）",
        artifacts: [
          artifact("通知", "file", id, `/results/${encodeURIComponent(id)}`),
        ],
        evidence: {
          notificationIds: [id],
          artifactIds: [id],
          storageObjectIds: [],
          externalActionIds: [],
          externalUrls: [],
        },
      };
    }

    if (step.type === "wait" || step.type === "condition") {
      return {
        ok: true,
        summary: `${capability.name}（controlled control）`,
        artifacts: [],
        evidence: {},
      };
    }

    // Vision/OCR/unimplemented — fail closed in controlled harness too
    return {
      ok: false,
      summary: "controlled harness: step_not_implemented",
      artifacts: [],
      errorCode: "step_not_implemented",
      errorMessage: step.type,
      failedStage: "STEP_DISPATCH",
      retryable: false,
    };
  };
}

export function recordRunCostFromSteps(
  runId: string,
  automationId: string,
  userId: string,
  steps: AutomationWorkflowStep[],
  outcomes: Array<{ stepId: string; ok: boolean }>,
) {
  const costSteps = steps.map((step) => {
    const outcome = outcomes.find((item) => item.stepId === step.id);
    return estimateStepCost({
      stepId: step.id,
      capabilityId: step.type,
      ok: outcome?.ok ?? false,
    });
  });
  return recordAutomationRunCost({
    runId,
    automationId,
    userId,
    steps: costSteps,
  });
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export function maskSecret(value: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]")
    .replace(/(token["']?\s*[:=]\s*["']?)[^"'\\s]+/gi, "$1[REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
}
