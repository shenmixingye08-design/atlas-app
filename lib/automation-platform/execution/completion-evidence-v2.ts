/**
 * Completion Evidence for V2 Automation runs.
 * Evidence creation failure forbids marking the run as completed.
 *
 * Required for product completed:
 * Artifact / Storage URL / Timestamp / Execution ID / Result Hash / Output Size
 */

import { createHash } from "node:crypto";

import type { AutomationRun } from "@/lib/automation-platform/types/run";

export const COMPLETION_EVIDENCE_VERSION = 2 as const;

export type AutomationV2CompletionEvidence = {
  runId: string;
  jobId: string;
  automationId: string;
  ownerId: string;
  executionId: string;
  completedStepIds: string[];
  artifactIds: string[];
  storageObjectIds: string[];
  storageUrls: string[];
  externalActionIds: string[];
  externalUrls: string[];
  notificationIds: string[];
  incompleteOptionalStepIds: string[];
  outputSizeBytes: number;
  completionHash: string;
  completedAt: string;
  evidenceVersion: typeof COMPLETION_EVIDENCE_VERSION;
  /** Present when the run succeeded after retries */
  retryCount: number;
  retryReason: string | null;
  retryTime: string | null;
  /** Per-step evidence fragments — step-scoped completion checks */
  stepEvidence: Record<string, StepEvidenceFragment>;
};

export type StepEvidenceFragment = {
  stepId?: string;
  artifactIds?: string[];
  storageObjectIds?: string[];
  externalActionIds?: string[];
  externalUrls?: string[];
  notificationIds?: string[];
  outputSizeBytes?: number;
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function mergeEvidenceFragments(
  fragments: StepEvidenceFragment[],
): Required<
  Pick<
    StepEvidenceFragment,
    | "artifactIds"
    | "storageObjectIds"
    | "externalActionIds"
    | "externalUrls"
    | "notificationIds"
  >
> & { outputSizeBytes: number } {
  return {
    artifactIds: unique(fragments.flatMap((item) => item.artifactIds ?? [])),
    storageObjectIds: unique(
      fragments.flatMap((item) => item.storageObjectIds ?? []),
    ),
    externalActionIds: unique(
      fragments.flatMap((item) => item.externalActionIds ?? []),
    ),
    externalUrls: unique(fragments.flatMap((item) => item.externalUrls ?? [])),
    notificationIds: unique(
      fragments.flatMap((item) => item.notificationIds ?? []),
    ),
    outputSizeBytes: fragments.reduce(
      (sum, item) => sum + (item.outputSizeBytes ?? 0),
      0,
    ),
  };
}

export function buildCompletionEvidenceV2(input: {
  run: AutomationRun;
  completedStepIds: string[];
  fragments: StepEvidenceFragment[];
  incompleteOptionalStepIds?: string[];
  completedAt?: string;
  retryCount?: number;
  retryReason?: string | null;
  retryTime?: string | null;
}): AutomationV2CompletionEvidence | null {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const merged = mergeEvidenceFragments(input.fragments);

  // Artifact / storage URLs come from real deliverable artifacts + fragment urls.
  // Do NOT promote deliverable.id into externalActionIds (that was a fake-success hole).
  const artifactIds = unique([
    ...merged.artifactIds,
    ...input.run.artifacts
      .filter((item) => item.kind === "deliverable" || item.kind === "file")
      .map((item) => item.id),
  ]);
  const storageUrls = unique([
    ...merged.externalUrls,
    ...input.run.artifacts
      .filter((item) => item.kind === "deliverable")
      .map((item) => item.url)
      .filter((url): url is string => Boolean(url)),
  ]);
  const storageObjectIds = unique([
    ...merged.storageObjectIds,
    ...input.run.artifacts
      .filter((item) => item.kind === "deliverable")
      .map((item) => item.id),
  ]);

  if (input.completedStepIds.length === 0) {
    return null;
  }

  const stepEvidence: Record<string, StepEvidenceFragment> = {};
  for (const fragment of input.fragments) {
    if (!fragment.stepId) continue;
    stepEvidence[fragment.stepId] = fragment;
  }

  const executionId = input.run.id;
  const outputSizeBytes =
    merged.outputSizeBytes > 0
      ? merged.outputSizeBytes
      : input.run.artifacts.reduce(
          (sum, item) => sum + (typeof (item as { sizeBytes?: number }).sizeBytes === "number"
            ? (item as { sizeBytes?: number }).sizeBytes!
            : 0),
          0,
        );

  const payload = {
    runId: input.run.id,
    jobId: input.run.id,
    automationId: input.run.automationId,
    ownerId: input.run.userId,
    executionId,
    completedStepIds: [...input.completedStepIds].sort(),
    artifactIds: [...artifactIds].sort(),
    storageObjectIds: [...storageObjectIds].sort(),
    storageUrls: [...storageUrls].sort(),
    externalActionIds: [...merged.externalActionIds].sort(),
    externalUrls: [...merged.externalUrls].sort(),
    notificationIds: [...merged.notificationIds].sort(),
    incompleteOptionalStepIds: [
      ...(input.incompleteOptionalStepIds ?? []),
    ].sort(),
    outputSizeBytes,
    completedAt,
    evidenceVersion: COMPLETION_EVIDENCE_VERSION,
    retryCount: input.retryCount ?? Math.max(0, input.run.attemptCount - 1),
    retryReason: input.retryReason ?? null,
    retryTime: input.retryTime ?? null,
  };

  const completionHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  return {
    ...payload,
    completionHash,
    stepEvidence,
  };
}

/**
 * Hard gate fields required before product "completed".
 */
export function validateCompletionEvidenceFields(
  evidence: AutomationV2CompletionEvidence | null,
  opts?: { requireArtifacts?: boolean; requireNotifications?: boolean; requireExternal?: boolean },
): string[] {
  if (!evidence) return ["evidence"];
  const missing: string[] = [];
  if (!evidence.executionId?.trim()) missing.push("executionId");
  if (!evidence.completedAt?.trim()) missing.push("timestamp");
  if (!evidence.completionHash?.trim()) missing.push("resultHash");
  if (opts?.requireArtifacts !== false) {
    if (evidence.artifactIds.length === 0) missing.push("artifact");
    if (evidence.storageUrls.length === 0 && evidence.externalUrls.length === 0) {
      missing.push("storageUrl");
    }
    if (evidence.outputSizeBytes <= 0 && evidence.artifactIds.length > 0) {
      // size may be unknown for some artifact kinds — require size when deliverables exist
      if (evidence.storageObjectIds.length > 0 && evidence.outputSizeBytes <= 0) {
        missing.push("outputSize");
      }
    }
  }
  if (opts?.requireNotifications && evidence.notificationIds.length === 0) {
    missing.push("notification");
  }
  if (opts?.requireExternal && evidence.externalActionIds.length === 0) {
    missing.push("externalAction");
  }
  return missing;
}

/** Attach evidence onto run resultSummary metadata channel (durable-friendly). */
export function evidenceSummaryLine(
  evidence: AutomationV2CompletionEvidence,
): string {
  return `evidence:${evidence.completionHash.slice(0, 12)}:v${evidence.evidenceVersion}:artifacts=${evidence.artifactIds.length}:bytes=${evidence.outputSizeBytes}`;
}
