/**
 * Durable WordPress external-action idempotency.
 */

import "server-only";

import { createHash } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { WordPressExternalAction, WordPressLiveAction } from "./types";

const TABLE = "atlas_wordpress_external_actions" as const;

type MemoryBucket = Map<string, WordPressExternalAction>;

function memoryKey(ownerId: string, idempotencyKey: string): string {
  return `${ownerId}:${idempotencyKey}`;
}

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasWordPressExternalActions?: MemoryBucket;
  };
  if (!scope.__atlasWordPressExternalActions) {
    scope.__atlasWordPressExternalActions = new Map();
  }
  return scope.__atlasWordPressExternalActions;
}

export function resetWordPressIdempotencyForTests(): void {
  getMemoryBucket().clear();
}

export function buildWordPressResultHash(action: {
  action: WordPressLiveAction;
  postId: number;
  postStatus: string;
  link: string;
  titleHash: string;
  contentHash: string;
  mediaIds: number[];
}): string {
  return createHash("sha256")
    .update(
      [
        action.action,
        String(action.postId),
        action.postStatus,
        action.link,
        action.titleHash,
        action.contentHash,
        [...action.mediaIds].sort((a, b) => a - b).join(","),
      ].join("|"),
    )
    .digest("hex");
}

function rowToAction(row: Record<string, unknown>): WordPressExternalAction | null {
  const ownerId = typeof row.owner_id === "string" ? row.owner_id : null;
  const idempotencyKey =
    typeof row.idempotency_key === "string" ? row.idempotency_key : null;
  const actionRaw = typeof row.action === "string" ? row.action : null;
  const postId =
    typeof row.post_id === "number"
      ? row.post_id
      : Number(row.post_id ?? 0);
  if (!ownerId || !idempotencyKey || !actionRaw || !postId) return null;

  const status =
    row.status === "awaiting_approval" ? "awaiting_approval" : "verified";

  return {
    externalActionId:
      typeof row.id === "string"
        ? row.id
        : `wordpress_${idempotencyKey.slice(0, 12)}`,
    service: "wordpress",
    action: actionRaw as WordPressLiveAction,
    postId,
    postStatus: typeof row.post_status === "string" ? row.post_status : "",
    link: typeof row.link === "string" ? row.link : "",
    editLink: typeof row.edit_link === "string" ? row.edit_link : "",
    titleHash: typeof row.title_hash === "string" ? row.title_hash : "",
    contentHash: typeof row.content_hash === "string" ? row.content_hash : "",
    mediaArtifactIds: Array.isArray(row.media_artifact_ids)
      ? row.media_artifact_ids.filter((id): id is string => typeof id === "string")
      : [],
    mediaIds: Array.isArray(row.media_ids)
      ? row.media_ids
          .map((id) =>
            typeof id === "number" ? id : Number(id),
          )
          .filter((n) => Number.isFinite(n) && n > 0)
      : [],
    status,
    adapterMode: "production",
    environment:
      typeof row.environment === "string" ? row.environment : "unknown",
    diagnosticId:
      typeof row.diagnostic_id === "string" ? row.diagnostic_id : "",
    startedAt:
      typeof row.started_at === "string"
        ? row.started_at
        : new Date().toISOString(),
    completedAt:
      typeof row.completed_at === "string"
        ? row.completed_at
        : new Date().toISOString(),
    retryCount:
      typeof row.retry_count === "number"
        ? row.retry_count
        : Number(row.retry_count ?? 0),
    idempotencyKey,
    providerRequestId:
      typeof row.provider_request_id === "string"
        ? row.provider_request_id
        : null,
    resultHash: typeof row.result_hash === "string" ? row.result_hash : "",
    duplicatePrevented: true,
    approvalId: typeof row.approval_id === "string" ? row.approval_id : null,
  };
}

export async function findWordPressActionByIdempotency(input: {
  ownerId: string;
  idempotencyKey: string;
}): Promise<WordPressExternalAction | null> {
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
                error: { message?: string } | null;
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
    return rowToAction(data);
  } catch {
    return null;
  }
}

export async function saveWordPressExternalAction(
  action: WordPressExternalAction & {
    ownerId: string;
    organizationId?: string | null;
    runId: string;
    stepId: string;
  },
): Promise<void> {
  getMemoryBucket().set(memoryKey(action.ownerId, action.idempotencyKey), {
    ...action,
    duplicatePrevented: false,
  });

  const client = createServiceRoleClientIfConfigured();
  if (!client) return;

  try {
    const unresolved = client as unknown as {
      from: (table: string) => {
        upsert: (
          row: Record<string, unknown>,
          options: { onConflict: string },
        ) => Promise<{ error: { message?: string } | null }>;
      };
    };

    await unresolved.from(TABLE).upsert(
      {
        id: action.externalActionId,
        owner_id: action.ownerId,
        organization_id: action.organizationId ?? null,
        run_id: action.runId,
        step_id: action.stepId,
        action: action.action,
        idempotency_key: action.idempotencyKey,
        post_id: action.postId,
        post_status: action.postStatus,
        link: action.link,
        edit_link: action.editLink,
        title_hash: action.titleHash,
        content_hash: action.contentHash,
        media_artifact_ids: action.mediaArtifactIds,
        media_ids: action.mediaIds,
        status: action.status,
        adapter_mode: action.adapterMode,
        environment: action.environment,
        diagnostic_id: action.diagnosticId,
        retry_count: action.retryCount,
        started_at: action.startedAt,
        completed_at: action.completedAt,
        provider_request_id: action.providerRequestId,
        result_hash: action.resultHash,
        approval_id: action.approvalId,
      },
      { onConflict: "owner_id,idempotency_key" },
    );
  } catch {
    // Memory already holds the action for this process.
  }
}
