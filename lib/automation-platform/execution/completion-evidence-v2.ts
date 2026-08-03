/**
 * Completion Evidence for V2 Automation runs.
 * Evidence creation failure forbids marking the run as completed.
 */

import { createHash } from "node:crypto";

import type { AutomationRun } from "@/lib/automation-platform/types/run";

export const COMPLETION_EVIDENCE_VERSION = 1 as const;

export type DriveStepEvidence = {
  service: "google_drive";
  fileId: string;
  webViewLink: string;
  size: number;
  checksum: string;
  targetFolderId: string;
  fileName: string;
  completedAt: string;
  resultHash: string;
  retryCount: number;
  duplicatePrevented: boolean;
};

export type AutomationV2CompletionEvidence = {
  runId: string;
  jobId: string;
  automationId: string;
  ownerId: string;
  completedStepIds: string[];
  artifactIds: string[];
  storageObjectIds: string[];
  externalActionIds: string[];
  externalUrls: string[];
  notificationIds: string[];
  incompleteOptionalStepIds: string[];
  completionHash: string;
  completedAt: string;
  evidenceVersion: typeof COMPLETION_EVIDENCE_VERSION;
  adapterMode: string | null;
  environment: string | null;
  driveResults: DriveStepEvidence[];
};

export type StepEvidenceFragment = {
  artifactIds?: string[];
  storageObjectIds?: string[];
  externalActionIds?: string[];
  externalUrls?: string[];
  notificationIds?: string[];
  adapterMode?: string;
  environment?: string;
  drive?: DriveStepEvidence;
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function mergeEvidenceFragments(
  fragments: StepEvidenceFragment[],
): Required<
  Omit<StepEvidenceFragment, "adapterMode" | "environment" | "drive">
> & {
  adapterMode: string | null;
  environment: string | null;
  driveResults: DriveStepEvidence[];
} {
  const driveResults = fragments
    .map((item) => item.drive)
    .filter((item): item is DriveStepEvidence => Boolean(item));
  const adapterMode =
    fragments.map((item) => item.adapterMode).find((item) => item?.trim()) ??
    null;
  const environment =
    fragments.map((item) => item.environment).find((item) => item?.trim()) ??
    null;
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
    adapterMode,
    environment,
    driveResults,
  };
}

export function buildCompletionEvidenceV2(input: {
  run: AutomationRun;
  completedStepIds: string[];
  fragments: StepEvidenceFragment[];
  incompleteOptionalStepIds?: string[];
  completedAt?: string;
}): AutomationV2CompletionEvidence | null {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const merged = mergeEvidenceFragments(input.fragments);
  const artifactIds = unique([
    ...merged.artifactIds,
    ...input.run.artifacts.map((item) => item.id),
  ]);
  const externalUrls = unique([
    ...merged.externalUrls,
    ...input.run.artifacts
      .map((item) => item.url)
      .filter((url): url is string => Boolean(url)),
  ]);
  const externalActionIds = unique([
    ...merged.externalActionIds,
    ...input.run.artifacts
      .map((item) => item.externalId)
      .filter((id): id is string => Boolean(id)),
  ]);

  if (input.completedStepIds.length === 0) {
    return null;
  }

  const payload = {
    runId: input.run.id,
    jobId: input.run.id,
    automationId: input.run.automationId,
    ownerId: input.run.userId,
    completedStepIds: [...input.completedStepIds].sort(),
    artifactIds: [...artifactIds].sort(),
    storageObjectIds: [...merged.storageObjectIds].sort(),
    externalActionIds: [...externalActionIds].sort(),
    externalUrls: [...externalUrls].sort(),
    notificationIds: [...merged.notificationIds].sort(),
    incompleteOptionalStepIds: [
      ...(input.incompleteOptionalStepIds ?? []),
    ].sort(),
    completedAt,
    evidenceVersion: COMPLETION_EVIDENCE_VERSION,
    adapterMode: merged.adapterMode,
    environment: merged.environment,
    driveResults: merged.driveResults,
  };

  const completionHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  return {
    ...payload,
    completionHash,
  };
}

/** Attach evidence onto run resultSummary metadata channel (durable-friendly). */
export function evidenceSummaryLine(
  evidence: AutomationV2CompletionEvidence,
): string {
  return `evidence:${evidence.completionHash.slice(0, 12)}:v${evidence.evidenceVersion}:artifacts=${evidence.artifactIds.length}`;
}
