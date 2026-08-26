import "server-only";

import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { checkXConnectionForUser } from "@/lib/integrations/x/connection-status";
import { X_RECONNECT_REQUIRED_MESSAGE } from "@/lib/integrations/x/errors";
import { validateTweetText } from "./validate";
import {
  buildXPostIdempotencyKey,
  cancelDurableXPostJob,
  hashXPostContent,
  insertDurableXPostJob,
  listDurableXPostJobs,
} from "./durable-x-post-jobs";
import type { XPostBatch, XPostBatchItem } from "./batch-types";

export const X_BATCH_SCOPE_REQUIRED_MESSAGE =
  "X投稿に必要な権限が不足しています。設定からXを再連携してください。";
export const X_BATCH_DISCONNECTED_MESSAGE =
  "X連携が無効です。設定からXを再連携してください。";
export const X_BATCH_UNAPPROVED_BLOCK_MESSAGE =
  "承認されていない投稿は公開しません。";

export function buildBatchItemIdempotencyKey(input: {
  ownerId: string;
  itemId: string;
  text: string;
  scheduledFor: string;
}): string {
  return buildXPostIdempotencyKey({
    ownerId: input.ownerId,
    draftIdOrSourceId: `xbatch:${input.itemId}`,
    contentHash: hashXPostContent(input.text),
    scheduledAt: input.scheduledFor,
    eventVersion: "x-batch-v1",
  });
}

export function describeXBatchConnectionError(
  result: Awaited<ReturnType<typeof checkXConnectionForUser>>,
): string | null {
  if (result.status === "ready") {
    if (!result.postingReady) return X_BATCH_SCOPE_REQUIRED_MESSAGE;
    return null;
  }
  if (result.status === "disconnected") return X_BATCH_DISCONNECTED_MESSAGE;
  if (result.status === "reconnect_required") {
    return result.message || X_RECONNECT_REQUIRED_MESSAGE;
  }
  if (result.status === "feature_disabled") return result.message;
  return result.message || X_BATCH_DISCONNECTED_MESSAGE;
}

export async function collectOccupiedJobInstants(ownerId: string): Promise<Set<string>> {
  const jobs = await listDurableXPostJobs({ ownerId, pendingOnly: true });
  const occupied = new Set<string>();
  for (const job of jobs) {
    if (job.scheduledAt) occupied.add(job.scheduledAt);
  }
  return occupied;
}

async function cancelPreviousJob(item: XPostBatchItem): Promise<void> {
  if (!item.xPostJobId) return;
  try {
    await cancelDurableXPostJob({
      xPostJobId: item.xPostJobId,
      ownerId: item.ownerId,
    });
  } catch {
    // Already posted / unknown_outcome — do not recreate.
  }
}

export type BatchConnectionChecker = (input: {
  userId: string;
  context: FeatureAccessContext;
}) => Promise<string | null>;

export const defaultBatchConnectionChecker: BatchConnectionChecker = async (
  input,
) => {
  const result = await checkXConnectionForUser(input);
  return describeXBatchConnectionError(result);
};

/**
 * Reserve an approved item on the existing durable X job ledger.
 * Cron / processDueScheduledXPosts publishes it. Unapproved items never
 * receive a job.
 */
export async function scheduleApprovedBatchItem(input: {
  batch: XPostBatch;
  item: XPostBatchItem;
  context: FeatureAccessContext;
  occupiedUtc: Set<string>;
  checkConnection?: BatchConnectionChecker;
}): Promise<XPostBatchItem> {
  if (input.item.status === "published" || input.item.status === "publishing") {
    return input.item;
  }
  if (input.item.approvalStatus !== "approved") {
    return {
      ...input.item,
      errorMessage: X_BATCH_UNAPPROVED_BLOCK_MESSAGE,
    };
  }
  if (!input.item.text.trim()) {
    return { ...input.item, status: "failed", errorMessage: "本文が空です。" };
  }
  if (!input.item.scheduledFor) {
    return {
      ...input.item,
      errorMessage: "予約日時が未設定です。日時を自動分散してください。",
    };
  }

  const scheduledMs = new Date(input.item.scheduledFor).getTime();
  if (Number.isNaN(scheduledMs)) {
    return { ...input.item, status: "failed", errorMessage: "予約日時が不正です。" };
  }

  const validation = validateTweetText(input.item.text);
  if (validation.errors.length > 0) {
    return {
      ...input.item,
      status: "failed",
      errorMessage: validation.errors.join(" / "),
    };
  }

  const connectionError = await (input.checkConnection ??
    defaultBatchConnectionChecker)({
    userId: input.item.ownerId,
    context: input.context,
  });
  if (connectionError) {
    return { ...input.item, errorMessage: connectionError };
  }

  if (
    input.occupiedUtc.has(input.item.scheduledFor) &&
    input.item.idempotencyKey !==
      buildBatchItemIdempotencyKey({
        ownerId: input.item.ownerId,
        itemId: input.item.id,
        text: input.item.text,
        scheduledFor: input.item.scheduledFor,
      })
  ) {
    return {
      ...input.item,
      status: "failed",
      errorMessage: "同じXアカウントの同じ日時に、別の予約があります。",
    };
  }

  const idempotencyKey = buildBatchItemIdempotencyKey({
    ownerId: input.item.ownerId,
    itemId: input.item.id,
    text: input.item.text,
    scheduledFor: input.item.scheduledFor,
  });

  if (input.item.xPostJobId && input.item.idempotencyKey === idempotencyKey) {
    return {
      ...input.item,
      status: "scheduled",
      errorMessage: null,
    };
  }

  await cancelPreviousJob(input.item);

  const inserted = await insertDurableXPostJob({
    ownerId: input.item.ownerId,
    content: input.item.text,
    scheduledAt: input.item.scheduledFor,
    draftId: `xbatch:${input.item.id}`,
    automationId: `x-batch:${input.batch.id}`,
    approvalStatus: "approved",
    eventVersion: "x-batch-v1",
  });

  input.occupiedUtc.add(input.item.scheduledFor);
  return {
    ...input.item,
    status: "scheduled",
    xPostJobId: inserted.job.xPostJobId,
    idempotencyKey: inserted.job.idempotencyKey || idempotencyKey,
    errorMessage: null,
  };
}

export async function scheduleApprovedBatchItems(input: {
  batch: XPostBatch;
  items: XPostBatchItem[];
  context: FeatureAccessContext;
  checkConnection?: BatchConnectionChecker;
}): Promise<XPostBatchItem[]> {
  const occupied = await collectOccupiedJobInstants(input.batch.ownerId);
  const next: XPostBatchItem[] = [];
  for (const item of input.items) {
    next.push(
      await scheduleApprovedBatchItem({
        batch: input.batch,
        item,
        context: input.context,
        occupiedUtc: occupied,
        checkConnection: input.checkConnection,
      }),
    );
  }
  return next;
}
