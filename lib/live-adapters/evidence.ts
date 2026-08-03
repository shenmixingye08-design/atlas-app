/**
 * Integration execution evidence — required for completed external work.
 */

import { createHash } from "crypto";

import type { LiveExecutionResult } from "./types";

export type IntegrationEvidence = {
  executionId: string;
  providerId: string | null;
  externalActionId: string | null;
  externalUrl: string | null;
  timestamp: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  retryAttempts: number;
  checksum: string | null;
  diagnosticId: string;
  status: LiveExecutionResult["status"];
};

export function buildIntegrationEvidence(
  result: LiveExecutionResult,
  extras?: { checksum?: string | null },
): IntegrationEvidence {
  const started = new Date(result.startedAt).getTime();
  const completed = new Date(result.completedAt).getTime();
  const retryAttempts =
    typeof result.metadata.retryAttempts === "number"
      ? result.metadata.retryAttempts
      : 0;
  return {
    executionId: result.diagnosticId,
    providerId: result.providerRequestId,
    externalActionId: result.externalActionId,
    externalUrl: result.externalUrl,
    timestamp: result.completedAt,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    latencyMs: Number.isFinite(completed - started)
      ? Math.max(0, completed - started)
      : 0,
    retryAttempts,
    checksum: extras?.checksum ?? null,
    diagnosticId: result.diagnosticId,
    status: result.status,
  };
}

/** Fail-closed: succeeded without Provider external id / URL is forbidden. */
export function evidenceAllowsCompleted(
  evidence: IntegrationEvidence,
  requireUrl = true,
): boolean {
  if (evidence.status !== "succeeded" && evidence.status !== "duplicate_skipped") {
    return false;
  }
  if (!evidence.externalActionId?.trim()) return false;
  if (requireUrl && !evidence.externalUrl?.trim()) return false;
  if (/^(stub|fake|mock|placeholder)/i.test(evidence.externalActionId)) {
    return false;
  }
  return true;
}

export function hashEvidencePayload(evidence: IntegrationEvidence): string {
  return createHash("sha256")
    .update(JSON.stringify(evidence))
    .digest("hex")
    .slice(0, 32);
}
