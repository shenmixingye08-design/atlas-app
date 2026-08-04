import "server-only";

import { createHash } from "node:crypto";

import {
  ARTIFACT_CONTEXT_VERSION,
  buildArtifactDiagnosticId,
  buildCompletionEvidenceId,
  type ArtifactCompletionEvidence,
  type DurableArtifactContract,
} from "./artifact-contract";
import {
  loadDurableDeliverable,
  persistDurableDeliverable,
  type DurableDeliverableRow,
  type PersistDurableResult,
} from "./durable-store";
import { buildIntegritySnapshot, sha256Hex } from "./integrity";
import { downloadDeliverableObject } from "./object-storage";
import {
  assertDeliverableBackendReady,
  isDeliverableStorageRequired,
  resolveDeliverableStorageBackend,
} from "./storage-backend";
import {
  DELIVERABLE_METADATA_TTL_MS,
  MAX_DELIVERABLE_STORAGE_BYTES,
} from "./constants";
import type { DeliverableMetadata, GeneratedDeliverableFile } from "./types";
import type { StoredDeliverable } from "./store";

export class ArtifactPersistError extends Error {
  readonly code: string;
  readonly diagnosticId: string;

  constructor(code: string, message: string, diagnosticId: string) {
    super(message);
    this.name = "ArtifactPersistError";
    this.code = code;
    this.diagnosticId = diagnosticId;
  }
}

export type SaveDeliverableArtifactInput = {
  file: GeneratedDeliverableFile;
  ownerId: string;
  sourceContent: string;
  baseFileName?: string;
  deliverableId?: string;
  organizationId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  stepId?: string | null;
  metadata?: DeliverableMetadata | null;
};

export type SaveDeliverableArtifactResult = {
  stored: StoredDeliverable;
  persist: PersistDurableResult;
  contract: DurableArtifactContract;
  evidence: ArtifactCompletionEvidence;
};

function stripExtension(fileName: string, format: string): string {
  const ext = `.${format}`;
  if (fileName.toLowerCase().endsWith(ext)) {
    return fileName.slice(0, -ext.length);
  }
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

function toRow(
  stored: StoredDeliverable,
  extras: {
    organizationId: string | null;
    runId: string | null;
    jobId: string | null;
    stepId: string | null;
    diagnosticId: string;
  },
): DurableDeliverableRow {
  const expiresAt = new Date(
    new Date(stored.generatedAt).getTime() + DELIVERABLE_METADATA_TTL_MS,
  ).toISOString();
  const integrity = buildIntegritySnapshot({
    buffer: stored.buffer,
    format: stored.format,
    fileName: stored.fileName,
  });
  return {
    id: stored.id,
    userId: stored.userId,
    fileName: stored.fileName,
    format: stored.format,
    mimeType: stored.mimeType,
    isPlaceholder: stored.isPlaceholder,
    sourceContent: stored.sourceContent,
    baseFileName: stored.baseFileName,
    sizeBytes: stored.buffer.byteLength,
    contentBase64:
      stored.buffer.byteLength <= 512 * 1024
        ? stored.buffer.toString("base64")
        : null,
    contentSha256: integrity.sha256,
    storageBucket: null,
    storagePath: null,
    storageStatus: "pending",
    storageError: null,
    hasPkHeader: integrity.hasPkHeader,
    ooxmlVerified: integrity.ooxmlVerified,
    downloadCount: 0,
    lastDownloadedAt: null,
    deletionReason: null,
    deletedAt: null,
    metadata: {
      ...(stored.metadata ?? {}),
      organizationId: extras.organizationId,
      runId: extras.runId,
      jobId: extras.jobId,
      stepId: extras.stepId,
      diagnosticId: extras.diagnosticId,
      contextVersion: ARTIFACT_CONTEXT_VERSION,
    },
    generatedAt: stored.generatedAt,
    expiresAt,
  };
}

/**
 * Formal P0-3 save path for ALL deliverable formats.
 * Order: bytes → checksum → Storage upload → re-fetch verify → DB → evidence.
 * Any failure → throws (completed forbidden).
 */
export async function saveDeliverableArtifact(
  input: SaveDeliverableArtifactInput,
): Promise<SaveDeliverableArtifactResult> {
  const diagnosticId = buildArtifactDiagnosticId("persist");
  const ownerId = input.ownerId.trim();
  if (!ownerId) {
    throw new ArtifactPersistError(
      "owner_required",
      "ownerId is required to store a deliverable artifact",
      diagnosticId,
    );
  }

  assertDeliverableBackendReady();

  const buffer = input.file.buffer;
  if (!buffer || buffer.byteLength === 0) {
    throw new ArtifactPersistError(
      "zero_byte",
      "zero-byte artifacts cannot be completed",
      diagnosticId,
    );
  }
  if (buffer.byteLength > MAX_DELIVERABLE_STORAGE_BYTES) {
    throw new ArtifactPersistError(
      "too_large",
      `artifact exceeds ${MAX_DELIVERABLE_STORAGE_BYTES} bytes`,
      diagnosticId,
    );
  }

  // Path traversal / absolute path in fileName — reject before persist.
  const rawName = input.file.fileName ?? "";
  if (
    rawName.includes("..") ||
    rawName.includes("/") ||
    rawName.includes("\\") ||
    rawName.startsWith("~")
  ) {
    throw new ArtifactPersistError(
      "path_traversal",
      "fileName must not contain path separators or traversal",
      diagnosticId,
    );
  }

  const integrity = buildIntegritySnapshot({
    buffer,
    format: input.file.format,
    fileName: input.file.fileName,
  });
  const checksum = integrity.sha256;
  if (!checksum) {
    throw new ArtifactPersistError(
      "checksum_missing",
      "checksum required before durable upload",
      diagnosticId,
    );
  }

  const artifactId =
    input.deliverableId?.trim() || crypto.randomUUID();

  const existing = await loadDurableDeliverable(artifactId, ownerId);
  if (
    existing &&
    existing.contentSha256 &&
    existing.contentSha256 !== checksum &&
    existing.storageStatus === "stored"
  ) {
    throw new ArtifactPersistError(
      "artifact_id_conflict",
      "same artifactId already stored with a different checksum",
      diagnosticId,
    );
  }

  const baseFileName =
    input.baseFileName?.trim() ||
    stripExtension(input.file.fileName, input.file.format);
  const generatedAt = new Date().toISOString();

  const stored: StoredDeliverable = {
    ...input.file,
    id: artifactId,
    generatedAt,
    userId: ownerId,
    sourceContent: input.sourceContent?.trim() ?? "",
    baseFileName,
    contentSha256: checksum,
    metadata: input.metadata ?? null,
  };

  // Cache only after we have identity — durable persist is authoritative.
  const { getStoreBucketForArtifact } = await import("./store-internal");
  getStoreBucketForArtifact().set(stored.id, stored);

  const row = toRow(stored, {
    organizationId: input.organizationId ?? null,
    runId: input.runId ?? null,
    jobId: input.jobId ?? null,
    stepId: input.stepId ?? null,
    diagnosticId,
  });

  const persist = await persistDurableDeliverable(row, buffer);

  if (!persist.durable) {
    throw new ArtifactPersistError(
      "not_durable",
      persist.storageError ?? "durable persist failed",
      diagnosticId,
    );
  }

  if (isDeliverableStorageRequired()) {
    if (
      persist.storageStatus !== "stored" ||
      !persist.row.storageBucket ||
      !persist.row.storagePath
    ) {
      throw new ArtifactPersistError(
        "storage_missing",
        "Production requires Storage object before completion",
        diagnosticId,
      );
    }

    const fetched = await downloadDeliverableObject({
      bucket: persist.row.storageBucket,
      path: persist.row.storagePath,
    });
    if (!fetched.ok) {
      throw new ArtifactPersistError(
        "verify_download_failed",
        fetched.error,
        diagnosticId,
      );
    }
    if (fetched.buffer.byteLength !== buffer.byteLength) {
      throw new ArtifactPersistError(
        "size_mismatch",
        `byteSize mismatch local=${buffer.byteLength} remote=${fetched.buffer.byteLength}`,
        diagnosticId,
      );
    }
    const remoteSha = sha256Hex(fetched.buffer);
    if (remoteSha !== checksum) {
      throw new ArtifactPersistError(
        "checksum_mismatch",
        "storage object checksum does not match generated bytes",
        diagnosticId,
      );
    }
  }

  const verifiedAt = new Date().toISOString();
  stored.storageStatus = persist.storageStatus;
  stored.contentSha256 = checksum;
  getStoreBucketForArtifact().set(stored.id, stored);

  const backend = resolveDeliverableStorageBackend();
  const contract: DurableArtifactContract = {
    artifactId: stored.id,
    ownerId,
    organizationId: input.organizationId ?? null,
    runId: input.runId ?? null,
    jobId: input.jobId ?? null,
    stepId: input.stepId ?? null,
    artifactType: stored.format,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    extension: stored.format,
    byteSize: buffer.byteLength,
    checksum,
    storageProvider:
      backend === "supabase"
        ? "supabase"
        : backend === "memory_durable"
          ? "memory_durable"
          : "none",
    bucket: persist.row.storageBucket,
    storagePath: persist.row.storagePath,
    status: "verified",
    createdAt: generatedAt,
    storedAt: verifiedAt,
    verifiedAt,
    deletedAt: null,
    diagnosticId,
    contextVersion: ARTIFACT_CONTEXT_VERSION,
    completionEvidenceId: buildCompletionEvidenceId(stored.id),
  };

  const resultHash = createHash("sha256")
    .update(`${contract.artifactId}:${checksum}:${contract.byteSize}`)
    .digest("hex");

  const evidence: ArtifactCompletionEvidence = {
    completionEvidenceId: contract.completionEvidenceId!,
    artifactId: stored.id,
    storagePath: persist.row.storagePath ?? "",
    checksum,
    byteSize: buffer.byteLength,
    verifiedAt,
    diagnosticId,
    resultHash,
    ownerId,
  };

  if (isDeliverableStorageRequired() && !evidence.storagePath) {
    throw new ArtifactPersistError(
      "evidence_incomplete",
      "completion evidence requires storagePath",
      diagnosticId,
    );
  }

  return { stored, persist, contract, evidence };
}

/** True when artifact evidence is sufficient for Job completed. */
export function hasVerifiedArtifactEvidence(
  evidence: ArtifactCompletionEvidence | null | undefined,
): boolean {
  if (!evidence) return false;
  if (!evidence.artifactId || !evidence.ownerId) return false;
  if (!evidence.checksum || evidence.byteSize <= 0) return false;
  if (!evidence.verifiedAt || !evidence.completionEvidenceId) return false;
  if (isDeliverableStorageRequired() && !evidence.storagePath) return false;
  return true;
}
