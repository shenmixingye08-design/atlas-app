/**
 * Wire V2 document steps to the existing deliverables engine.
 * Does not rewrite Planner/Deliverable cores — only invokes generateDeliverables.
 */

import "server-only";

import { resolveAppOrigin } from "@/lib/billing/stripe/config";
import { generateDeliverables } from "@/lib/deliverables/engine";
import type { AutomationCapabilityId } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import {
  buildDeliverableSourceContent,
  formatsForDeliverableStep,
  isV2RealDeliverablesEnabled,
} from "@/lib/automation-platform/execution/real-deliverable-policy";

export type InvokeRealDeliverableInput = {
  stepType: AutomationCapabilityId;
  stepName: string;
  configuration: Record<string, unknown>;
  userId: string;
  automationName: string;
  runId: string;
  assignmentNotes?: string | null;
  requestOrigin?: string | null;
};

function fail(
  summary: string,
  errorCode: string,
  errorMessage: string,
  needsUserInput = false,
): StepInvokeResult {
  return {
    ok: false,
    summary,
    artifacts: [],
    errorCode,
    errorMessage,
    needsUserInput,
  };
}

export async function invokeRealDeliverableStep(
  input: InvokeRealDeliverableInput,
): Promise<StepInvokeResult> {
  if (!isV2RealDeliverablesEnabled()) {
    return fail(
      "成果物エンジンが一時停止中です",
      "automation_feature_disabled",
      "ATLAS_V2_REAL_DELIVERABLES=false",
    );
  }

  const formats = formatsForDeliverableStep(input.stepType);
  if (!formats) {
    return fail(
      "未対応の成果物手順です",
      "automation_unsupported_step",
      `No formats for ${input.stepType}`,
    );
  }

  const source = buildDeliverableSourceContent({
    automationName: input.automationName,
    assignmentNotes: input.assignmentNotes,
    stepName: input.stepName,
    stepType: input.stepType,
    configuration: input.configuration,
  });

  if (!source.content.trim()) {
    return fail(
      "成果物の元になる内容が不足しています",
      "automation_invalid_definition",
      "empty_deliverable_source",
      true,
    );
  }

  // Apply Personal Memory into source before generateDeliverables (instruction wins).
  let assignment = source.assignment;
  let content = source.content;
  let title = source.title;
  try {
    const { applyMemoryToDeliverableSource } = await import(
      "@/lib/personal-memory/bridge/deliverable"
    );
    const applied = await applyMemoryToDeliverableSource({
      userId: input.userId,
      content: source.content,
      assignment: source.assignment,
      title: source.title,
      notes: input.assignmentNotes,
      currentInstruction: input.configuration,
      formats,
      artifactTypes: [input.stepType],
    });
    assignment = applied.assignment;
    content = applied.content;
    title = applied.title;
  } catch (error) {
    console.warn("[invoke-real-deliverable] memory apply skipped:", error);
  }

  const origin = resolveAppOrigin(
    input.requestOrigin?.trim() || "http://localhost:3000",
  );

  try {
    const generated = await generateDeliverables(
      {
        assignment,
        finalDeliverable: content,
        title,
        formats,
      },
      origin,
      {
        userId: input.userId,
        jobId: `v2dlv_${input.runId}_${input.stepType}`.slice(0, 48),
        // Instruction text is user-authored; avoid a second AI pass for Light cost.
        contentAlreadyApproved: true,
        suppressWordReadyNotification: false,
      },
    );

    if (generated.deliverables.length === 0) {
      const reason =
        generated.failures[0]?.reasons.join(", ") || "deliverable_empty";
      return fail(
        "成果物を生成できませんでした",
        "automation_run_failed",
        reason,
      );
    }

    const artifacts: AutomationRunArtifact[] = generated.deliverables.map(
      (file) => ({
        id: file.id,
        kind: "deliverable" as const,
        label: file.fileName,
        url: file.downloadUrl,
        externalId: file.id,
        createdAt: file.generatedAt,
      }),
    );

    const primary = generated.deliverables[0]!;
    return {
      ok: true,
      summary: `${primary.fileName} を作成しました`,
      artifacts,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "deliverable_generation_failed";
    return fail("成果物の作成に失敗しました", "automation_run_failed", message);
  }
}
