/**
 * Controlled E2E harness helpers — never invents live external success.
 */

import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
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
): AutomationRunArtifact {
  return {
    id: crypto.randomUUID(),
    kind,
    label,
    url: null,
    externalId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Controlled invoker for platform mechanics tests.
 * - Document/local steps succeed with labeled local artifacts
 * - External steps NEVER succeed (fail closed) unless explicitly overridden
 *   via `allowExternalSimulation` for partial-success / retry mechanics only,
 *   and those are tagged controlled_external (not live).
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
        errorCode: "automation_unsupported_step",
        errorMessage: step.type,
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
          };
        }
      }
      if (behavior === "controlled_success") {
        return {
          ok: true,
          summary: `controlled_external:${step.type}`,
          artifacts: [
            artifact(`controlled:${step.type}`, "external", `ctrl:${step.id}`),
          ],
        };
      }
      return {
        ok: false,
        summary: `${step.type}は未接続/ライブ未実行のため成功扱いしません`,
        artifacts: [],
        errorCode: "automation_integration_required",
        errorMessage: "external_not_live",
      };
    }

    // Local / document steps
    return {
      ok: true,
      summary: `${capability.name}（controlled local）`,
      artifacts: [artifact(`${capability.name}`, "deliverable")],
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
