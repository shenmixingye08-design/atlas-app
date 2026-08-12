/**
 * Finalize Automation runs stuck in `running` after steps already terminalized
 * (void-persist race left DB SoT without completionEvidence / completedAt).
 */

import "server-only";

import {
  buildCompletionEvidenceV2,
  evidenceSummaryLine,
} from "@/lib/automation-platform/execution/completion-evidence-v2";
import {
  evaluateRunCompletion,
  runCompletionUserMessage,
} from "@/lib/automation-platform/execution/run-completion";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import { getAutomationV2FromSot } from "@/lib/automation-platform/durable";
import { isExternalActionCapability } from "@/lib/automation-platform/operations/idempotency";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

const TERMINAL_STEP = new Set([
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);

function normalizeSafeRetrySkippedSteps(
  run: AutomationRun,
  workflowSteps: { id: string; type: string }[],
): AutomationRun["steps"] {
  return run.steps.map((step) => {
    let id = step.id;
    if (!workflowSteps.some((item) => item.id === id)) {
      const byType = workflowSteps.filter(
        (item) => item.type === step.capabilityId,
      );
      if (byType.length === 1) id = byType[0]!.id;
    }
    if (
      step.status === "skipped" &&
      isExternalActionCapability(step.capabilityId) &&
      (step.outputSummary || step.completedAt)
    ) {
      return {
        ...step,
        id,
        status: "succeeded" as const,
        errorCode: null,
        errorMessage: null,
      };
    }
    return { ...step, id };
  });
}

async function loadClaimExternalIds(runId: string): Promise<string[]> {
  const sb = createServiceRoleClientIfConfigured();
  if (!sb) return [];
  const { data, error } = await sb
    .from("atlas_side_effect_claims")
    .select("provider_resource_id")
    .eq("run_id", runId)
    .eq("status", "succeeded")
    .not("provider_resource_id", "is", null)
    .limit(20);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) =>
      typeof row.provider_resource_id === "string"
        ? row.provider_resource_id
        : "",
    )
    .filter((id) => id.trim().length > 0);
}

export async function finalizeOrphanRunningRun(
  run: AutomationRun,
): Promise<AutomationRun | null> {
  if (run.status !== "running") return null;
  if (!run.steps.every((step) => TERMINAL_STEP.has(step.status))) {
    return null;
  }

  const automation = await getAutomationV2FromSot(run.automationId);
  if (!automation) return null;

  const steps = normalizeSafeRetrySkippedSteps(
    run,
    automation.workflow.steps.map((step) => ({ id: step.id, type: step.type })),
  );
  const completedStepIds = steps
    .filter((step) => step.status === "succeeded")
    .map((step) => step.id);
  const claimIds = await loadClaimExternalIds(run.id);
  const notificationIds = run.artifacts
    .flatMap((item) => [item.id, item.externalId ?? ""])
    .filter(
      (id) => typeof id === "string" && (id.startsWith("ntf_") || id.startsWith("notif_")),
    );
  const fragment = {
    artifactIds: run.artifacts.map((item) => item.id),
    storageObjectIds: run.artifacts
      .filter((item) => item.kind === "deliverable")
      .map((item) => item.id),
    externalActionIds: [
      ...run.artifacts
        .map((item) => item.externalId)
        .filter((id): id is string => Boolean(id)),
      ...claimIds,
    ],
    externalUrls: run.artifacts
      .map((item) => item.url)
      .filter((url): url is string => Boolean(url)),
    notificationIds,
  };
  const finishedAt = new Date().toISOString();
  const evidence = buildCompletionEvidenceV2({
    run: { ...run, steps },
    completedStepIds,
    fragments: [fragment],
    completedAt: finishedAt,
  });

  const decision = evaluateRunCompletion({
    run: { ...run, steps },
    workflowSteps: automation.workflow.steps,
    artifacts: run.artifacts,
    evidence,
    needsUserInput: false,
    retryScheduled: false,
  });

  if (
    (decision.runStatus === "succeeded" ||
      decision.runStatus === "partially_succeeded") &&
    !evidence
  ) {
    const entry = createStatusTransition({
      previousStatus: "running",
      nextStatus: "failed",
      reason: "orphan_completion_evidence_missing",
      actor: { type: "worker", component: "finalize_orphan_running" },
      diagnosticId: run.diagnosticId || crypto.randomUUID(),
    });
    return persistAutomationRunNow({
      ...run,
      steps,
      status: "failed",
      statusHistory: [...run.statusHistory, entry],
      completedAt: entry.timestamp,
      updatedAt: entry.timestamp,
      completionEvidence: null,
      retryable: false,
      nextRetryAt: null,
      resultSummary: "Completion Evidenceを作成できないため完了できません",
      lastErrorCode: "automation_run_failed",
      lastErrorMessage: "completion_evidence_missing",
    });
  }

  if (
    decision.runStatus === "succeeded" ||
    decision.runStatus === "partially_succeeded"
  ) {
    const { assertRequiredExternalEvidence, resolveRequiredExternals } =
      await import("@/lib/automations/required-external-fail-closed");
    const declared = automation.instruction.structuredOptions?.requiredExternals;
    const required = resolveRequiredExternals({
      sourceText: automation.instruction.freeformNotes,
      declared: Array.isArray(declared)
        ? (declared as import("@/lib/automations/detect-external-intent").RequiredExternalAction[])
        : null,
    });
    const externalGate = assertRequiredExternalEvidence({
      required,
      enabledStepTypes: automation.workflow.steps
        .filter((step) => step.enabled)
        .map((step) => step.type),
      executedStepTypes: steps
        .filter((step) => step.status === "succeeded")
        .map((step) => step.capabilityId),
      externalActionIds: evidence?.externalActionIds ?? [],
    });
    if (!externalGate.ok) {
      const entry = createStatusTransition({
        previousStatus: "running",
        nextStatus: "failed",
        reason: externalGate.code,
        actor: { type: "worker", component: "finalize_orphan_running" },
        diagnosticId: run.diagnosticId || crypto.randomUUID(),
      });
      return persistAutomationRunNow({
        ...run,
        steps,
        status: "failed",
        statusHistory: [...run.statusHistory, entry],
        completedAt: entry.timestamp,
        updatedAt: entry.timestamp,
        completionEvidence: evidence,
        retryable: false,
        nextRetryAt: null,
        resultSummary: externalGate.reason,
        lastErrorCode: "automation_run_failed",
        lastErrorMessage: externalGate.reason,
      });
    }
  }

  const entry = createStatusTransition({
    previousStatus: "running",
    nextStatus: decision.runStatus,
    reason: `orphan_finalize:${decision.reason}`,
    actor: { type: "worker", component: "finalize_orphan_running" },
    diagnosticId: run.diagnosticId || crypto.randomUUID(),
  });
  const userMessage = runCompletionUserMessage(decision.productStatus);
  return persistAutomationRunNow({
    ...run,
    steps,
    status: decision.runStatus,
    statusHistory: [...run.statusHistory, entry],
    completedAt: entry.timestamp,
    updatedAt: entry.timestamp,
    completionEvidence: evidence,
    retryable: false,
    nextRetryAt: null,
    resultSummary:
      decision.runStatus === "succeeded"
        ? `${userMessage}（orphan finalize） ${evidence ? evidenceSummaryLine(evidence) : ""}`.trim()
        : decision.runStatus === "partially_succeeded"
          ? `${userMessage} ${evidence ? evidenceSummaryLine(evidence) : ""}`.trim()
          : run.lastErrorMessage ?? userMessage,
    lastErrorCode:
      decision.runStatus === "failed"
        ? run.lastErrorCode ?? "automation_run_failed"
        : null,
    lastErrorMessage:
      decision.runStatus === "failed"
        ? run.lastErrorMessage ?? decision.reason
        : null,
  });
}
