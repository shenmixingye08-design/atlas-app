import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { ATLAS_DELIVERABLE_FILES_BUCKET } from "./constants";
import { consumeWordFault } from "./fault-inject";
import {
  allowDeliverableDiskFallback,
  isDeliverableStorageRequired,
  resolveDeliverableStorageBackend,
} from "./storage-backend";
import type { DeliverableFormat } from "./types";

export type ObjectStorageUploadResult =
  | {
      ok: true;
      bucket: string;
      path: string;
      backend: "supabase";
    }
  | {
      ok: true;
      bucket: null;
      path: null;
      backend: "local";
    }
  | {
      ok: false;
      error: string;
      backend: "supabase" | "local";
    };

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown";
}

export function buildDeliverableObjectPath(input: {
  userId: string;
  deliverableId: string;
  format: DeliverableFormat;
  sha256: string;
}): string {
  const ext = input.format;
  const hashPrefix = input.sha256.slice(0, 16);
  // Opaque path: user / uuid / hash.ext — prevents guessable sequential names.
  return [
    sanitizeSegment(input.userId),
    sanitizeSegment(input.deliverableId),
    `${hashPrefix}.${ext}`,
  ].join("/");
}

/** Stable metadata sidecar when Postgres deliverable table is unavailable. */
export function buildDeliverableMetaPath(input: {
  userId: string;
  deliverableId: string;
}): string {
  return [
    sanitizeSegment(input.userId),
    sanitizeSegment(input.deliverableId),
    "meta.bin",
  ].join("/");
}

export type DeliverableSidecarMeta = {
  id: string;
  userId: string;
  fileName: string;
  format: DeliverableFormat;
  mimeType: string;
  isPlaceholder: boolean;
  sourceContent: string;
  baseFileName: string;
  sizeBytes: number | null;
  contentSha256: string | null;
  storageBucket: string;
  storagePath: string;
  storageStatus: "stored";
  hasPkHeader: boolean | null;
  ooxmlVerified: boolean | null;
  metadata: unknown;
  generatedAt: string;
  expiresAt: string;
};

export async function writeDeliverableSidecarMeta(
  meta: DeliverableSidecarMeta,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return { ok: false, error: "supabase_not_configured" };

  const path = buildDeliverableMetaPath({
    userId: meta.userId,
    deliverableId: meta.id,
  });
  const body = Buffer.from(JSON.stringify(meta), "utf8");
  const { error } = await client.storage
    .from(ATLAS_DELIVERABLE_FILES_BUCKET)
    .upload(path, body, {
      // Bucket allow-list may omit application/json — use octet-stream.
      contentType: "application/octet-stream",
      upsert: true,
    });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function readDeliverableSidecarMeta(input: {
  userId: string;
  deliverableId: string;
}): Promise<DeliverableSidecarMeta | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  const path = buildDeliverableMetaPath(input);
  const { data, error } = await client.storage
    .from(ATLAS_DELIVERABLE_FILES_BUCKET)
    .download(path);
  if (error || !data) return null;
  try {
    const text = await data.text();
    const parsed = JSON.parse(text) as DeliverableSidecarMeta;
    if (!parsed?.id || parsed.id !== input.deliverableId) return null;
    if (parsed.userId !== input.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function ensureDeliverableBucket(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "service_role_missing" };
  }

  const listed = await client.storage.listBuckets();
  if (listed.error) {
    return { ok: false, error: listed.error.message };
  }
  if (listed.data?.some((b) => b.name === ATLAS_DELIVERABLE_FILES_BUCKET)) {
    return { ok: true };
  }

  const created = await client.storage.createBucket(ATLAS_DELIVERABLE_FILES_BUCKET, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/markdown",
      "text/plain",
      "application/octet-stream",
    ],
  });

  if (created.error) {
    const lower = (created.error.message ?? "").toLowerCase();
    if (lower.includes("already exists") || lower.includes("duplicate")) {
      return { ok: true };
    }
    return { ok: false, error: created.error.message };
  }
  return { ok: true };
}

export async function uploadDeliverableObject(input: {
  userId: string;
  deliverableId: string;
  format: DeliverableFormat;
  mimeType: string;
  sha256: string;
  buffer: Buffer;
}): Promise<ObjectStorageUploadResult> {
  if (consumeWordFault("storage_upload")) {
    return {
      ok: false,
      error: "fault_inject:storage_upload",
      backend: resolveDeliverableStorageBackend(),
    };
  }

  const backend = resolveDeliverableStorageBackend();
  if (backend === "local") {
    return { ok: true, bucket: null, path: null, backend: "local" };
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (allowDeliverableDiskFallback()) {
      return { ok: true, bucket: null, path: null, backend: "local" };
    }
    return {
      ok: false,
      error: "supabase_not_configured",
      backend: "supabase",
    };
  }

  const ensured = await ensureDeliverableBucket();
  if (!ensured.ok) {
    return {
      ok: false,
      error: ensured.error ?? "bucket_ensure_failed",
      backend: "supabase",
    };
  }

  const path = buildDeliverableObjectPath(input);
  const { error } = await client.storage
    .from(ATLAS_DELIVERABLE_FILES_BUCKET)
    .upload(path, input.buffer, {
      contentType: input.mimeType,
      upsert: false,
    });

  if (error) {
    const lower = (error.message ?? "").toLowerCase();
    // Same content path already present — treat as success (idempotent retry).
    if (lower.includes("already exists") || lower.includes("duplicate") || lower.includes("resource already")) {
      return {
        ok: true,
        bucket: ATLAS_DELIVERABLE_FILES_BUCKET,
        path,
        backend: "supabase",
      };
    }
    return { ok: false, error: error.message, backend: "supabase" };
  }

  return {
    ok: true,
    bucket: ATLAS_DELIVERABLE_FILES_BUCKET,
    path,
    backend: "supabase",
  };
}

export async function downloadDeliverableObject(input: {
  bucket: string;
  path: string;
}): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  if (consumeWordFault("storage_download")) {
    return { ok: false, error: "fault_inject:storage_download" };
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_not_configured" };
  }

  const { data, error } = await client.storage
    .from(input.bucket)
    .download(input.path);

  if (error || !data) {
    return { ok: false, error: error?.message ?? "download_empty" };
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.byteLength === 0) {
    return { ok: false, error: "empty_object" };
  }
  return { ok: true, buffer };
}

export async function probeDeliverableStorage(): Promise<{
  backend: "supabase" | "local";
  required: boolean;
  serviceRoleConfigured: boolean;
  bucket: string;
  bucketExists: boolean;
  ready: boolean;
  warning: string | null;
  severity: "ok" | "warn" | "critical";
}> {
  const backend = resolveDeliverableStorageBackend();
  const required = isDeliverableStorageRequired();
  const client = createServiceRoleClientIfConfigured();
  const serviceRoleConfigured = Boolean(client);

  if (backend === "local") {
    return {
      backend,
      required,
      serviceRoleConfigured,
      bucket: ATLAS_DELIVERABLE_FILES_BUCKET,
      bucketExists: false,
      ready: true,
      warning:
        "開発環境は memory/disk fallback を使用しています。本番では Supabase Storage が必須です。",
      severity: "warn",
    };
  }

  if (!client) {
    return {
      backend,
      required,
      serviceRoleConfigured: false,
      bucket: ATLAS_DELIVERABLE_FILES_BUCKET,
      bucketExists: false,
      ready: false,
      warning:
        "本番相当環境で SUPABASE_SERVICE_ROLE_KEY 未設定です。Word成果物の永続保存ができません。",
      severity: "critical",
    };
  }

  const ensured = await ensureDeliverableBucket();
  return {
    backend,
    required,
    serviceRoleConfigured: true,
    bucket: ATLAS_DELIVERABLE_FILES_BUCKET,
    bucketExists: ensured.ok,
    ready: ensured.ok,
    warning: ensured.ok
      ? null
      : `Storage bucket ${ATLAS_DELIVERABLE_FILES_BUCKET} を用意できません: ${ensured.error ?? "unknown"}`,
    severity: ensured.ok ? "ok" : "critical",
  };
}
