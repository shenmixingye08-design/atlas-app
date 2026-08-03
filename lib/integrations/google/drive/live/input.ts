import { createHash, randomUUID } from "node:crypto";

import type { StoredDeliverable } from "@/lib/deliverables/store";
import { sha256Hex } from "@/lib/deliverables/integrity";

import {
  DEFAULT_DRIVE_CONFLICT_POLICY,
  DRIVE_CONFLICT_POLICIES,
  type DriveConflictPolicy,
  type DriveUploadStepInput,
} from "./types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function asConflictPolicy(value: unknown): DriveConflictPolicy {
  if (
    typeof value === "string" &&
    (DRIVE_CONFLICT_POLICIES as readonly string[]).includes(value)
  ) {
    return value as DriveConflictPolicy;
  }
  return DEFAULT_DRIVE_CONFLICT_POLICY;
}

export function buildDriveIdempotencyKey(input: {
  ownerId: string;
  runId: string;
  stepId: string;
  artifactId: string;
  targetFolderId: string;
  checksum: string;
  explicit?: string | null;
}): string {
  if (input.explicit?.trim()) return input.explicit.trim();
  const material = [
    input.ownerId,
    input.runId,
    input.stepId,
    input.artifactId,
    input.targetFolderId,
    input.checksum,
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}

export function resolveDriveUploadInput(input: {
  ownerId: string;
  organizationId?: string | null;
  runId: string;
  stepId: string;
  diagnosticId?: string | null;
  configuration: Readonly<Record<string, unknown>>;
  inputBindings: Readonly<Record<string, unknown>>;
  artifact: StoredDeliverable;
  resolvedFolderId: string;
}): DriveUploadStepInput {
  const config = input.configuration;
  const bindings = input.inputBindings;

  const artifactId =
    asString(config.artifactId) ||
    asString(bindings.artifactId) ||
    input.artifact.id;
  if (!artifactId) {
    throw new Error("invalid artifact: artifactId is required");
  }
  if (artifactId !== input.artifact.id) {
    throw new Error("invalid artifact: artifactId does not match stored file");
  }
  if (input.artifact.userId !== input.ownerId) {
    throw new Error("invalid artifact: owner isolation violation");
  }

  const fileName =
    asString(config.fileName) ||
    asString(bindings.fileName) ||
    input.artifact.fileName;
  if (!fileName || /[\\/\u0000]/.test(fileName)) {
    throw new Error("invalid filename");
  }

  const mimeType =
    asString(config.mimeType) ||
    asString(bindings.mimeType) ||
    input.artifact.mimeType;
  if (!mimeType) {
    throw new Error("invalid artifact: mimeType is required");
  }

  const size =
    typeof config.size === "number"
      ? config.size
      : input.artifact.buffer.byteLength;
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("invalid artifact: size must be positive");
  }
  if (size !== input.artifact.buffer.byteLength) {
    throw new Error("invalid artifact: size mismatch");
  }

  const checksum =
    asString(config.checksum) ||
    input.artifact.contentSha256 ||
    sha256Hex(input.artifact.buffer);
  if (!checksum) {
    throw new Error("invalid artifact: checksum is required");
  }

  const targetFolderId =
    asString(config.targetFolderId) ||
    asString(bindings.targetFolderId) ||
    asString(config.folderId) ||
    input.resolvedFolderId;

  const folderPath =
    asString(config.folderPath) ||
    asString(bindings.folderPath) ||
    asString(config.saveTarget);

  const conflictPolicy = asConflictPolicy(
    config.conflictPolicy ?? config.onConflict,
  );
  const createFolderIfMissing = asBoolean(
    config.createFolderIfMissing ?? true,
    true,
  );

  const idempotencyKey = buildDriveIdempotencyKey({
    ownerId: input.ownerId,
    runId: input.runId,
    stepId: input.stepId,
    artifactId,
    targetFolderId,
    checksum,
    explicit: asString(config.idempotencyKey),
  });

  return {
    artifactId,
    fileName,
    mimeType,
    size,
    checksum,
    targetFolderId,
    folderPath,
    conflictPolicy,
    createFolderIfMissing,
    idempotencyKey,
    ownerId: input.ownerId,
    organizationId: input.organizationId ?? null,
    runId: input.runId,
    stepId: input.stepId,
    diagnosticId: asString(input.diagnosticId) || randomUUID(),
  };
}

export function validateDriveUploadInputRuntime(
  value: unknown,
): DriveUploadStepInput {
  if (!value || typeof value !== "object") {
    throw new Error("invalid Drive upload input");
  }
  const record = value as Record<string, unknown>;
  const requiredStrings = [
    "artifactId",
    "fileName",
    "mimeType",
    "checksum",
    "idempotencyKey",
    "ownerId",
    "runId",
    "stepId",
    "diagnosticId",
  ] as const;
  for (const key of requiredStrings) {
    if (!asString(record[key])) {
      throw new Error(`invalid Drive upload input: ${key}`);
    }
  }
  if (typeof record.size !== "number" || record.size <= 0) {
    throw new Error("invalid Drive upload input: size");
  }
  const conflictPolicy = asConflictPolicy(record.conflictPolicy);
  return {
    artifactId: asString(record.artifactId)!,
    fileName: asString(record.fileName)!,
    mimeType: asString(record.mimeType)!,
    size: record.size,
    checksum: asString(record.checksum)!,
    targetFolderId: asString(record.targetFolderId),
    folderPath: asString(record.folderPath),
    conflictPolicy,
    createFolderIfMissing: asBoolean(record.createFolderIfMissing, true),
    idempotencyKey: asString(record.idempotencyKey)!,
    ownerId: asString(record.ownerId)!,
    organizationId: asString(record.organizationId),
    runId: asString(record.runId)!,
    stepId: asString(record.stepId)!,
    diagnosticId: asString(record.diagnosticId)!,
  };
}
