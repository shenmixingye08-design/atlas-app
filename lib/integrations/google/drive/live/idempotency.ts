import "server-only";

import { createHash } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { DriveExternalAction } from "./types";

const TABLE = "atlas_google_drive_upload_actions" as const;

type MemoryBucket = Map<string, DriveExternalAction>;

function memoryKey(ownerId: string, idempotencyKey: string): string {
  return `${ownerId}:${idempotencyKey}`;
}

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasGoogleDriveUploadActions?: MemoryBucket;
  };
  if (!scope.__atlasGoogleDriveUploadActions) {
    scope.__atlasGoogleDriveUploadActions = new Map();
  }
  return scope.__atlasGoogleDriveUploadActions;
}

export function resetGoogleDriveUploadIdempotencyForTests(): void {
  getMemoryBucket().clear();
}

export function buildDriveResultHash(action: {
  fileId: string;
  webViewLink: string;
  size: number;
  checksum: string;
  targetFolderId: string;
}): string {
  return createHash("sha256")
    .update(
      [
        action.fileId,
        action.webViewLink,
        String(action.size),
        action.checksum,
        action.targetFolderId,
      ].join("|"),
    )
    .digest("hex");
}

function rowToAction(row: Record<string, unknown>): DriveExternalAction | null {
  const ownerId = typeof row.owner_id === "string" ? row.owner_id : null;
  const fileId = typeof row.file_id === "string" ? row.file_id : null;
  const webViewLink =
    typeof row.web_view_link === "string" ? row.web_view_link : null;
  const idempotencyKey =
    typeof row.idempotency_key === "string" ? row.idempotency_key : null;
  if (!ownerId || !fileId || !webViewLink || !idempotencyKey) return null;

  return {
    externalActionId:
      typeof row.id === "string" ? row.id : `gdrive_${fileId}`,
    service: "google_drive",
    providerRequestId:
      typeof row.provider_request_id === "string"
        ? row.provider_request_id
        : null,
    fileId,
    webViewLink,
    targetFolderId:
      typeof row.target_folder_id === "string" ? row.target_folder_id : "",
    fileName: typeof row.file_name === "string" ? row.file_name : "",
    mimeType: typeof row.mime_type === "string" ? row.mime_type : "",
    size: typeof row.size_bytes === "number" ? row.size_bytes : Number(row.size_bytes ?? 0),
    checksum: typeof row.checksum === "string" ? row.checksum : "",
    status: "verified",
    startedAt:
      typeof row.started_at === "string"
        ? row.started_at
        : new Date().toISOString(),
    completedAt:
      typeof row.completed_at === "string"
        ? row.completed_at
        : new Date().toISOString(),
    retryCount:
      typeof row.retry_count === "number" ? row.retry_count : Number(row.retry_count ?? 0),
    idempotencyKey,
    adapterMode: "production",
    environment:
      typeof row.environment === "string" ? row.environment : "unknown",
    diagnosticId:
      typeof row.diagnostic_id === "string" ? row.diagnostic_id : "",
    resultHash: typeof row.result_hash === "string" ? row.result_hash : "",
    duplicatePrevented: true,
  };
}

export async function findDriveUploadByIdempotency(input: {
  ownerId: string;
  idempotencyKey: string;
}): Promise<DriveExternalAction | null> {
  const memory = getMemoryBucket().get(
    memoryKey(input.ownerId, input.idempotencyKey),
  );
  if (memory) {
    return { ...memory, duplicatePrevented: true };
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  try {
    const unresolved = client as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            eq: (
              column: string,
              value: string,
            ) => {
              maybeSingle: () => Promise<{
                data: Record<string, unknown> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
    const { data, error } = await unresolved
      .from(TABLE)
      .select("*")
      .eq("owner_id", input.ownerId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error || !data) return null;
    const action = rowToAction(data);
    if (action) {
      getMemoryBucket().set(memoryKey(input.ownerId, input.idempotencyKey), action);
    }
    return action;
  } catch {
    return null;
  }
}

export async function saveDriveUploadAction(
  action: DriveExternalAction,
  ownerId: string,
  organizationId: string | null,
  runId: string,
  stepId: string,
  artifactId: string,
): Promise<void> {
  getMemoryBucket().set(memoryKey(ownerId, action.idempotencyKey), action);

  const client = createServiceRoleClientIfConfigured();
  if (!client) return;

  try {
    // Table is added by migration 20260803; generated Database types may lag.
    const payload: Record<string, string | number | null> = {
      id: action.externalActionId,
      owner_id: ownerId,
      organization_id: organizationId,
      run_id: runId,
      step_id: stepId,
      artifact_id: artifactId,
      target_folder_id: action.targetFolderId,
      idempotency_key: action.idempotencyKey,
      file_id: action.fileId,
      web_view_link: action.webViewLink,
      file_name: action.fileName,
      mime_type: action.mimeType,
      size_bytes: action.size,
      checksum: action.checksum,
      provider_request_id: action.providerRequestId,
      provider_status: action.status,
      adapter_mode: action.adapterMode,
      environment: action.environment,
      diagnostic_id: action.diagnosticId,
      retry_count: action.retryCount,
      started_at: action.startedAt,
      completed_at: action.completedAt,
      result_hash: action.resultHash,
    };
    const unresolved = client as unknown as {
      from: (table: string) => {
        upsert: (
          values: Record<string, string | number | null>,
          options: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await unresolved.from(TABLE).upsert(payload, {
      onConflict: "owner_id,idempotency_key",
    });
    if (error) {
      console.warn(
        "[Google Drive Live] Failed to persist upload action:",
        error.message,
      );
    }
  } catch (error) {
    console.warn("[Google Drive Live] Upload action persist skipped:", error);
  }
}
