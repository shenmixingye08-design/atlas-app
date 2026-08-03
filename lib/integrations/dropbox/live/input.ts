import { createHash, randomUUID } from "node:crypto";

import type { StoredDeliverable } from "@/lib/deliverables/store";
import { sha256Hex } from "@/lib/deliverables/integrity";
import { dropboxContentHash } from "./upload";

import {
  DEFAULT_DROPBOX_CONFLICT_POLICY,
  DROPBOX_CONFLICT_POLICIES,
  type DropboxConflictPolicy,
  type DropboxUploadStepInput,
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

function asConflictPolicy(value: unknown): DropboxConflictPolicy {
  if (
    typeof value === "string" &&
    (DROPBOX_CONFLICT_POLICIES as readonly string[]).includes(value)
  ) {
    return value as DropboxConflictPolicy;
  }
  return DEFAULT_DROPBOX_CONFLICT_POLICY;
}

export function buildDropboxIdempotencyKey(input: {
  ownerId: string;
  runId: string;
  stepId: string;
  artifactId: string;
  targetPath: string;
  contentHash: string;
  explicit?: string | null;
}): string {
  if (input.explicit?.trim()) return input.explicit.trim();
  const material = [
    input.ownerId,
    input.runId,
    input.stepId,
    input.artifactId,
    input.targetPath,
    input.contentHash,
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}

export function resolveDropboxUploadInput(input: {
  ownerId: string;
  organizationId?: string | null;
  runId: string;
  stepId: string;
  diagnosticId?: string | null;
  configuration: Readonly<Record<string, unknown>>;
  inputBindings: Readonly<Record<string, unknown>>;
  artifact: StoredDeliverable;
  resolvedTargetPath: string;
}): DropboxUploadStepInput {
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

  const contentHash =
    asString(config.contentHash) ||
    input.artifact.contentSha256 ||
    dropboxContentHash(input.artifact.buffer) ||
    sha256Hex(input.artifact.buffer);
  if (!contentHash) {
    throw new Error("invalid artifact: contentHash is required");
  }

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
  const createSharedLink = asBoolean(
    config.createSharedLink ?? config.share ?? false,
    false,
  );

  const targetPath = input.resolvedTargetPath;

  const idempotencyKey = buildDropboxIdempotencyKey({
    ownerId: input.ownerId,
    runId: input.runId,
    stepId: input.stepId,
    artifactId,
    targetPath,
    contentHash,
    explicit: asString(config.idempotencyKey),
  });

  return {
    artifactId,
    fileName,
    mimeType,
    size,
    contentHash,
    targetPath,
    folderPath,
    conflictPolicy,
    createFolderIfMissing,
    createSharedLink,
    idempotencyKey,
    ownerId: input.ownerId,
    organizationId: input.organizationId ?? null,
    runId: input.runId,
    stepId: input.stepId,
    diagnosticId: asString(input.diagnosticId) || randomUUID(),
  };
}

export function validateDropboxUploadInputRuntime(
  value: unknown,
): DropboxUploadStepInput {
  if (!value || typeof value !== "object") {
    throw new Error("invalid Dropbox upload input");
  }
  const record = value as Record<string, unknown>;
  const requiredStrings = [
    "artifactId",
    "fileName",
    "mimeType",
    "contentHash",
    "targetPath",
    "idempotencyKey",
    "ownerId",
    "runId",
    "stepId",
    "diagnosticId",
  ] as const;
  for (const key of requiredStrings) {
    if (!asString(record[key])) {
      throw new Error(`invalid Dropbox upload input: ${key}`);
    }
  }
  if (typeof record.size !== "number" || record.size <= 0) {
    throw new Error("invalid Dropbox upload input: size");
  }
  const conflictPolicy = asConflictPolicy(record.conflictPolicy);
  return {
    artifactId: asString(record.artifactId)!,
    fileName: asString(record.fileName)!,
    mimeType: asString(record.mimeType)!,
    size: record.size,
    contentHash: asString(record.contentHash)!,
    targetPath: asString(record.targetPath)!,
    folderPath: asString(record.folderPath),
    conflictPolicy,
    createFolderIfMissing: asBoolean(record.createFolderIfMissing, true),
    createSharedLink: asBoolean(record.createSharedLink, false),
    idempotencyKey: asString(record.idempotencyKey)!,
    ownerId: asString(record.ownerId)!,
    organizationId: asString(record.organizationId),
    runId: asString(record.runId)!,
    stepId: asString(record.stepId)!,
    diagnosticId: asString(record.diagnosticId)!,
  };
}
