import "server-only";

import { createHash } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { DropboxExternalAction } from "./types";

const TABLE = "atlas_dropbox_upload_actions" as const;

type MemoryBucket = Map<string, DropboxExternalAction>;

function memoryKey(ownerId: string, idempotencyKey: string): string {
  return `${ownerId}:${idempotencyKey}`;
}

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDropboxUploadActions?: MemoryBucket;
  };
  if (!scope.__atlasDropboxUploadActions) {
    scope.__atlasDropboxUploadActions = new Map();
  }
  return scope.__atlasDropboxUploadActions;
}

export function resetDropboxUploadIdempotencyForTests(): void {
  getMemoryBucket().clear();
}

export function buildDropboxResultHash(action: {
  fileId: string;
  pathDisplay: string;
  rev: string;
  size: number;
  contentHash: string;
  targetPath: string;
}): string {
  return createHash("sha256")
    .update(
      [
        action.fileId,
        action.pathDisplay,
        action.rev,
        String(action.size),
        action.contentHash,
        action.targetPath,
      ].join("|"),
    )
    .digest("hex");
}

function rowToAction(row: Record<string, unknown>): DropboxExternalAction | null {
  const ownerId = typeof row.owner_id === "string" ? row.owner_id : null;
  const fileId = typeof row.file_id === "string" ? row.file_id : null;
  const pathDisplay =
    typeof row.path_display === "string" ? row.path_display : null;
  const rev = typeof row.rev === "string" ? row.rev : null;
  const idempotencyKey =
    typeof row.idempotency_key === "string" ? row.idempotency_key : null;
  if (!ownerId || !fileId || !pathDisplay || !rev || !idempotencyKey) return null;

  return {
    externalActionId:
      typeof row.id === "string" ? row.id : `dropbox_${fileId}`,
    service: "dropbox",
    providerRequestId:
      typeof row.provider_request_id === "string"
        ? row.provider_request_id
        : null,
    fileId,
    pathDisplay,
    rev,
    size: typeof row.size_bytes === "number" ? row.size_bytes : Number(row.size_bytes ?? 0),
    contentHash: typeof row.content_hash === "string" ? row.content_hash : "",
    targetPath: typeof row.target_path === "string" ? row.target_path : pathDisplay,
    fileName: typeof row.file_name === "string" ? row.file_name : "",
    mimeType: typeof row.mime_type === "string" ? row.mime_type : "",
    sharedLinkUrl:
      typeof row.shared_link_url === "string" ? row.shared_link_url : null,
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

export async function findDropboxUploadByIdempotency(input: {
  ownerId: string;
  idempotencyKey: string;
}): Promise<DropboxExternalAction | null> {
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

export async function saveDropboxUploadAction(
  action: DropboxExternalAction,
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
    const payload: Record<string, string | number | null> = {
      id: action.externalActionId,
      owner_id: ownerId,
      organization_id: organizationId,
      run_id: runId,
      step_id: stepId,
      artifact_id: artifactId,
      target_path: action.targetPath,
      idempotency_key: action.idempotencyKey,
      file_id: action.fileId,
      path_display: action.pathDisplay,
      rev: action.rev,
      file_name: action.fileName,
      mime_type: action.mimeType,
      size_bytes: action.size,
      content_hash: action.contentHash,
      shared_link_url: action.sharedLinkUrl,
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
        "[Dropbox Live] Failed to persist upload action:",
        error.message,
      );
    }
  } catch (error) {
    console.warn("[Dropbox Live] Upload action persist skipped:", error);
  }
}
