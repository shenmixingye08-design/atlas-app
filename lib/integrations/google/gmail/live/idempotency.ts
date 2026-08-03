/**
 * Durable Gmail draft/send idempotency — separate keys per action.
 */

import "server-only";

import { createHash } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { GmailExternalAction, GmailLiveAction } from "./types";

const TABLE = "atlas_gmail_external_actions" as const;

type MemoryBucket = Map<string, GmailExternalAction>;

function memoryKey(ownerId: string, idempotencyKey: string): string {
  return `${ownerId}:${idempotencyKey}`;
}

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasGmailExternalActions?: MemoryBucket;
  };
  if (!scope.__atlasGmailExternalActions) {
    scope.__atlasGmailExternalActions = new Map();
  }
  return scope.__atlasGmailExternalActions;
}

export function resetGmailIdempotencyForTests(): void {
  getMemoryBucket().clear();
}

export function buildGmailResultHash(action: {
  action: GmailLiveAction;
  draftId: string | null;
  messageId: string | null;
  threadId: string | null;
  recipientHash: string;
  subjectHash: string;
  bodyHash: string;
  attachmentHash: string;
}): string {
  return createHash("sha256")
    .update(
      [
        action.action,
        action.draftId ?? "",
        action.messageId ?? "",
        action.threadId ?? "",
        action.recipientHash,
        action.subjectHash,
        action.bodyHash,
        action.attachmentHash,
      ].join("|"),
    )
    .digest("hex");
}

function rowToAction(row: Record<string, unknown>): GmailExternalAction | null {
  const ownerId = typeof row.owner_id === "string" ? row.owner_id : null;
  const idempotencyKey =
    typeof row.idempotency_key === "string" ? row.idempotency_key : null;
  const actionRaw = typeof row.action === "string" ? row.action : null;
  if (!ownerId || !idempotencyKey || !actionRaw) return null;

  const draftId = typeof row.draft_id === "string" ? row.draft_id : null;
  const messageId = typeof row.message_id === "string" ? row.message_id : null;
  const status =
    row.status === "awaiting_approval" ? "awaiting_approval" : "verified";

  return {
    externalActionId:
      typeof row.id === "string" ? row.id : `gmail_${idempotencyKey.slice(0, 12)}`,
    service: "gmail",
    action: actionRaw as GmailLiveAction,
    draftId,
    messageId,
    threadId: typeof row.thread_id === "string" ? row.thread_id : null,
    recipientHash:
      typeof row.recipient_hash === "string" ? row.recipient_hash : "",
    subjectHash: typeof row.subject_hash === "string" ? row.subject_hash : "",
    bodyHash: typeof row.body_hash === "string" ? row.body_hash : "",
    attachmentHash:
      typeof row.attachment_hash === "string" ? row.attachment_hash : "",
    attachmentIds: Array.isArray(row.attachment_ids)
      ? row.attachment_ids.filter((id): id is string => typeof id === "string")
      : [],
    attachmentCount:
      typeof row.attachment_count === "number"
        ? row.attachment_count
        : Number(row.attachment_count ?? 0),
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
    deliveryGuarantee:
      row.delivery_guarantee === "provider_accepted"
        ? "provider_accepted"
        : "not_applicable",
  };
}

export async function findGmailActionByIdempotency(input: {
  ownerId: string;
  idempotencyKey: string;
}): Promise<GmailExternalAction | null> {
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

export async function saveGmailExternalAction(
  action: GmailExternalAction & {
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
        draft_id: action.draftId,
        message_id: action.messageId,
        thread_id: action.threadId,
        recipient_hash: action.recipientHash,
        subject_hash: action.subjectHash,
        body_hash: action.bodyHash,
        attachment_hash: action.attachmentHash,
        attachment_ids: action.attachmentIds,
        attachment_count: action.attachmentCount,
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
        delivery_guarantee: action.deliveryGuarantee,
      },
      { onConflict: "owner_id,idempotency_key" },
    );
  } catch {
    // Memory already holds the action for this process.
  }
}
