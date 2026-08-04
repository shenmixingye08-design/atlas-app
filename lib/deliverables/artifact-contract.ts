import type { DeliverableFormat } from "./types";

/** Formal durable artifact statuses (P0-3). */
export type ArtifactStatus =
  | "pending_storage"
  | "stored"
  | "verified"
  | "failed"
  | "orphan_storage"
  | "deleted";

/**
 * Shared Durable Artifact Contract — not Record<string, unknown>.
 * Maps onto atlas_deliverable_files (+ P0-3 columns).
 */
export type DurableArtifactContract = {
  artifactId: string;
  ownerId: string;
  organizationId: string | null;
  runId: string | null;
  jobId: string | null;
  stepId: string | null;
  artifactType: DeliverableFormat;
  fileName: string;
  mimeType: string;
  extension: string;
  byteSize: number;
  checksum: string;
  storageProvider: "supabase" | "memory_durable" | "none";
  bucket: string | null;
  storagePath: string | null;
  status: ArtifactStatus;
  createdAt: string;
  storedAt: string | null;
  verifiedAt: string | null;
  deletedAt: string | null;
  diagnosticId: string | null;
  contextVersion: string;
  completionEvidenceId: string | null;
};

export type ArtifactCompletionEvidence = {
  completionEvidenceId: string;
  artifactId: string;
  storagePath: string;
  checksum: string;
  byteSize: number;
  verifiedAt: string;
  diagnosticId: string;
  resultHash: string;
  ownerId: string;
};

export const ARTIFACT_CONTEXT_VERSION = "p0-3.v1";

export function buildArtifactDiagnosticId(kind: string): string {
  return `art_${kind}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function buildCompletionEvidenceId(artifactId: string): string {
  return `cev_${artifactId.replace(/-/g, "").slice(0, 20)}`;
}
