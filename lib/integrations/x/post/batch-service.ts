import "server-only";

import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { createDefaultXAutoPostSettings } from "./autopost-types";
import { applyMemoryToDedicatedAutoPost } from "./autopost-memory";
import { loadXAutoPostSettings } from "./autopost-settings-store";
import { X_TWEET_MAX_CHARS } from "./validate";
import {
  getXPostBatchMaxCount,
  isAllowedXPostBatchCount,
  parseXPostBatchCount,
  X_POST_BATCH_MAX_CONCURRENT_PER_USER,
  X_POST_BATCH_MAX_REGENERATE_PER_ITEM,
} from "./batch-config";
import {
  distributeBatchSchedule,
  normalizeBatchWeekdays,
  parseBatchDateKey,
  parseBatchPostTime,
  resolveBatchTimezone,
} from "./batch-schedule";
import { extractHashtags } from "./batch-safety";
import {
  generateBatchCopies,
  regenerateSingleBatchItem,
  type BatchCopyGenerator,
} from "./batch-generator";
import {
  defaultBatchConnectionChecker,
  scheduleApprovedBatchItems,
  type BatchConnectionChecker,
} from "./batch-publish";
import {
  countGeneratingBatchesForOwner,
  createEmptyBatch,
  createEmptyItem,
  deleteXPostBatchItemForOwner,
  getXPostBatchForOwner,
  getXPostBatchItemForOwner,
  insertXPostBatch,
  insertXPostBatchItems,
  listOccupiedScheduleInstants,
  listXPostBatchesForOwner,
  listXPostBatchItemsForOwner,
  updateXPostBatch,
  updateXPostBatchItem,
} from "./batch-store";
import type {
  XPostBatch,
  XPostBatchApprovalMode,
  XPostBatchInput,
  XPostBatchItem,
  XPostBatchWithItems,
} from "./batch-types";
import { isXPostBatchApprovalMode, summarizeBatchStatus } from "./batch-types";
import { cancelDurableXPostJob } from "./durable-x-post-jobs";

export type XPostBatchServiceResult =
  | { status: "ready"; batch: XPostBatch; items: XPostBatchItem[] }
  | { status: "unauthorized"; message: string }
  | { status: "not_found"; message: string }
  | { status: "feature_disabled"; message: string }
  | { status: "plan_limited"; message: string }
  | { status: "validation_failed"; message: string }
  | { status: "rate_limited"; message: string }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

function asText(value: unknown, max = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function parseXPostBatchInput(body: unknown): {
  input: XPostBatchInput | null;
  error: string | null;
} {
  if (!body || typeof body !== "object") {
    return { input: null, error: "入力内容を確認してください。" };
  }
  const raw = body as Record<string, unknown>;
  const count = parseXPostBatchCount(raw.count);
  if (count == null) {
    return {
      input: null,
      error: `作成数は1・3・7・12件から選び、最大${getXPostBatchMaxCount()}件までです。`,
    };
  }
  const startDate = parseBatchDateKey(raw.startDate);
  const endDate = parseBatchDateKey(raw.endDate);
  const postTime = parseBatchPostTime(raw.postTime);
  if (!startDate || !endDate || !postTime) {
    return {
      input: null,
      error: "投稿開始日・終了日・投稿時刻を正しく指定してください。",
    };
  }
  if (startDate > endDate) {
    return { input: null, error: "終了日は開始日以降にしてください。" };
  }
  if (!isXPostBatchApprovalMode(raw.approvalMode)) {
    return {
      input: null,
      error: "承認制または自動投稿を選んでください。",
    };
  }
  return {
    input: {
      purpose: asText(raw.purpose, 400),
      theme: asText(raw.theme, 200),
      audience: asText(raw.audience, 200),
      tone: asText(raw.tone, 200),
      includeContent: asText(raw.includeContent, 2000),
      forbiddenContent: asText(raw.forbiddenContent, 2000),
      hashtagPolicy: asText(raw.hashtagPolicy, 200),
      count,
      startDate,
      endDate,
      daysOfWeek: normalizeBatchWeekdays(raw.daysOfWeek),
      postTime,
      approvalMode: raw.approvalMode,
      timezone:
        typeof raw.timezone === "string" ? raw.timezone : undefined,
    },
    error: null,
  };
}

async function requireOwnedBatch(input: {
  batchId: string;
  ownerId: string;
}): Promise<XPostBatchWithItems | null> {
  const batch = await getXPostBatchForOwner(input);
  if (!batch) return null;
  const items = await listXPostBatchItemsForOwner(input);
  return { batch, items };
}

async function persistItems(items: XPostBatchItem[]): Promise<XPostBatchItem[]> {
  const saved: XPostBatchItem[] = [];
  for (const item of items) {
    saved.push(await updateXPostBatchItem(item));
  }
  return saved;
}

async function persistSummary(
  batch: XPostBatch,
  items: XPostBatchItem[],
  extra?: Partial<XPostBatch>,
): Promise<XPostBatch> {
  return updateXPostBatch({
    ...batch,
    ...extra,
    status: summarizeBatchStatus(items, extra?.cancelRequested ?? batch.cancelRequested),
  });
}

function toAutoPostSettings(input: {
  ownerId: string;
  batch: XPostBatch;
}): ReturnType<typeof createDefaultXAutoPostSettings> {
  const defaults = createDefaultXAutoPostSettings(input.ownerId);
  return {
    ...defaults,
    purpose: input.batch.purpose,
    themes: input.batch.theme ? [input.batch.theme] : [],
    audience: input.batch.audience,
    tone: input.batch.tone,
    timezone: input.batch.timezone,
    includeHashtags: !/付けない|なし|不要|禁止/.test(input.batch.hashtagPolicy),
    daysOfWeek: input.batch.daysOfWeek,
    postTimes: [input.batch.postTime],
  };
}

async function resolveMemorySettings(input: {
  ownerId: string;
  batch: XPostBatch;
}): Promise<{
  settings: ReturnType<typeof toAutoPostSettings>;
  guidance: string[];
  applied: boolean;
  labels: string[];
  memoryFailed: boolean;
}> {
  const base = toAutoPostSettings(input);
  try {
    const memory = await applyMemoryToDedicatedAutoPost({
      userId: input.ownerId,
      settings: base,
      oneShotText: [
        input.batch.includeContent,
        input.batch.forbiddenContent
          ? `書いてはいけない内容: ${input.batch.forbiddenContent}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    const forbidden = input.batch.forbiddenContent.trim()
      ? [`次の内容は書かない: ${input.batch.forbiddenContent}`]
      : [];
    const include = input.batch.includeContent.trim()
      ? [`含めたい内容: ${input.batch.includeContent}`]
      : [];
    return {
      settings: memory.settings,
      guidance: [...memory.guidance, ...include, ...forbidden],
      applied: memory.applied,
      labels: memory.labels,
      memoryFailed: memory.memoryFailed,
    };
  } catch {
    return {
      settings: base,
      guidance: [],
      applied: false,
      labels: [],
      memoryFailed: true,
    };
  }
}

async function resolveTimezone(ownerId: string, requested?: string): Promise<string> {
  if (requested?.trim()) return resolveBatchTimezone(requested);
  try {
    const settings = await loadXAutoPostSettings(ownerId);
    return resolveBatchTimezone(settings.timezone);
  } catch {
    return resolveBatchTimezone(null);
  }
}

export async function createAndGenerateXPostBatch(input: {
  ownerId: string;
  body: unknown;
  context: FeatureAccessContext;
  generate?: BatchCopyGenerator;
  checkConnection?: BatchConnectionChecker;
  signal?: AbortSignal;
}): Promise<XPostBatchServiceResult> {
  if (!input.ownerId) {
    return { status: "unauthorized", message: "ログインしてください。" };
  }
  if (!isFeatureEnabled("x", input.context)) {
    return { status: "feature_disabled", message: featureDisabledMessage("x") };
  }
  const parsed = parseXPostBatchInput(input.body);
  if (!parsed.input) {
    return { status: "validation_failed", message: parsed.error ?? "入力が不正です。" };
  }
  if (!isAllowedXPostBatchCount(parsed.input.count)) {
    return {
      status: "validation_failed",
      message: `作成数の上限は${getXPostBatchMaxCount()}件です。`,
    };
  }

  const generating = await countGeneratingBatchesForOwner(input.ownerId);
  if (generating >= X_POST_BATCH_MAX_CONCURRENT_PER_USER) {
    return {
      status: "conflict",
      message: "別のまとめて作成が進行中です。完了してから再度お試しください。",
    };
  }

  const timezone = await resolveTimezone(input.ownerId, parsed.input.timezone);
  const batch = await insertXPostBatch(
    createEmptyBatch({
      ownerId: input.ownerId,
      purpose: parsed.input.purpose,
      theme: parsed.input.theme,
      audience: parsed.input.audience,
      tone: parsed.input.tone,
      includeContent: parsed.input.includeContent,
      forbiddenContent: parsed.input.forbiddenContent,
      hashtagPolicy: parsed.input.hashtagPolicy,
      requestedCount: parsed.input.count,
      startDate: parsed.input.startDate,
      endDate: parsed.input.endDate,
      daysOfWeek: parsed.input.daysOfWeek,
      postTime: parsed.input.postTime,
      approvalMode: parsed.input.approvalMode,
      timezone,
    }),
  );

  const placeholders = Array.from({ length: parsed.input.count }, (_, index) =>
    createEmptyItem({
      batchId: batch.id,
      ownerId: input.ownerId,
      sequence: index + 1,
      theme: parsed.input!.theme,
    }),
  );
  await insertXPostBatchItems(placeholders);
  const generatingBatch = await updateXPostBatch({
    ...batch,
    status: "generating",
    generationAttempts: batch.generationAttempts + 1,
  });

  return continueBatchGeneration({
    ownerId: input.ownerId,
    batch: generatingBatch,
    items: placeholders,
    context: input.context,
    generate: input.generate,
    checkConnection: input.checkConnection,
    signal: input.signal,
  });
}

async function continueBatchGeneration(input: {
  ownerId: string;
  batch: XPostBatch;
  items: XPostBatchItem[];
  context: FeatureAccessContext;
  generate?: BatchCopyGenerator;
  checkConnection?: BatchConnectionChecker;
  signal?: AbortSignal;
}): Promise<XPostBatchServiceResult> {
  const memory = await resolveMemorySettings({
    ownerId: input.ownerId,
    batch: input.batch,
  });
  const generated = await generateBatchCopies({
    batch: input.batch,
    items: input.items,
    settings: memory.settings,
    memoryGuidance: memory.guidance,
    generate: input.generate,
    signal: input.signal,
    shouldCancel: () => input.batch.cancelRequested || Boolean(input.signal?.aborted),
  });

  const occupied = await listOccupiedScheduleInstants({ ownerId: input.ownerId });
  const slots = distributeBatchSchedule({
    startDate: input.batch.startDate,
    endDate: input.batch.endDate,
    daysOfWeek: input.batch.daysOfWeek,
    postTime: input.batch.postTime,
    timezone: input.batch.timezone,
    count: generated.items.length,
    occupiedUtc: occupied,
  });

  const slotQueue = [...slots];
  let items = generated.items.map((item) => ({
    ...item,
    scheduledFor:
      item.scheduledFor ?? slotQueue.shift()?.scheduledFor ?? null,
    approvalStatus:
      input.batch.approvalMode === "full_auto" && item.status === "ready"
        ? ("approved" as const)
        : item.approvalStatus,
    status:
      input.batch.approvalMode === "full_auto" && item.status === "ready"
        ? ("approved" as const)
        : item.status,
  }));

  let connectionError: string | null = null;
  if (input.batch.approvalMode === "full_auto") {
    const checker = input.checkConnection ?? defaultBatchConnectionChecker;
    connectionError = await checker({
      userId: input.ownerId,
      context: input.context,
    });
    if (!connectionError) {
      items = await scheduleApprovedBatchItems({
        batch: input.batch,
        items,
        context: input.context,
        checkConnection: checker,
      });
    } else {
      items = items.map((item) =>
        item.approvalStatus === "approved"
          ? { ...item, errorMessage: connectionError }
          : item,
      );
    }
  }

  items = await persistItems(items);
  const batch = await persistSummary(input.batch, items, {
    memoryApplied: memory.applied,
    memoryLabels: memory.labels,
    memoryFailed: memory.memoryFailed,
    connectionError,
    costUsd: input.batch.costUsd + generated.generatedCount * 0.002,
  });
  return { status: "ready", batch, items };
}

export async function listOwnedXPostBatches(input: {
  ownerId: string;
}): Promise<XPostBatch[]> {
  if (!input.ownerId) return [];
  return listXPostBatchesForOwner({ ownerId: input.ownerId });
}

export async function getOwnedXPostBatch(input: {
  ownerId: string;
  batchId: string;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  return { status: "ready", ...found };
}

export async function editOwnedXPostBatchItem(input: {
  ownerId: string;
  batchId: string;
  itemId: string;
  text?: string;
  scheduledFor?: string | null;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  const item = found.items.find((row) => row.id === input.itemId);
  if (!item) return { status: "not_found", message: "見つかりませんでした。" };
  if (item.status === "published" || item.status === "publishing") {
    return { status: "conflict", message: "公開済みの投稿は編集できません。" };
  }
  const text = input.text != null ? asText(input.text, X_TWEET_MAX_CHARS) : item.text;
  if (input.text != null && !text) {
    return { status: "validation_failed", message: "本文を入力してください。" };
  }
  const scheduledFor =
    input.scheduledFor === undefined ? item.scheduledFor : input.scheduledFor;
  const next = await updateXPostBatchItem({
    ...item,
    text,
    hashtags: extractHashtags(text),
    scheduledFor,
    status: item.approvalStatus === "approved" ? "approved" : "ready",
    errorMessage: null,
  });
  const items = found.items.map((row) => (row.id === next.id ? next : row));
  const batch = await persistSummary(found.batch, items);
  return { status: "ready", batch, items };
}

export async function regenerateOwnedXPostBatchItem(input: {
  ownerId: string;
  batchId: string;
  itemId: string;
  generate?: BatchCopyGenerator;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  const item = found.items.find((row) => row.id === input.itemId);
  if (!item) return { status: "not_found", message: "見つかりませんでした。" };
  if (item.regenerateCount >= X_POST_BATCH_MAX_REGENERATE_PER_ITEM) {
    return {
      status: "conflict",
      message: "再生成の上限に達しました。本文を直接編集してください。",
    };
  }
  const memory = await resolveMemorySettings({
    ownerId: input.ownerId,
    batch: found.batch,
  });
  const recentTexts = found.items
    .filter((row) => row.id !== item.id && row.text.trim())
    .map((row) => row.text);
  const next = await updateXPostBatchItem(
    await regenerateSingleBatchItem({
      batch: found.batch,
      item,
      settings: memory.settings,
      memoryGuidance: memory.guidance,
      recentTexts,
      generate: input.generate,
    }),
  );
  const items = found.items.map((row) => (row.id === next.id ? next : row));
  const batch = await persistSummary(found.batch, items);
  return { status: "ready", batch, items };
}

export async function setOwnedXPostBatchItemApproval(input: {
  ownerId: string;
  batchId: string;
  itemId: string;
  approved: boolean;
  context: FeatureAccessContext;
  checkConnection?: BatchConnectionChecker;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  const item = found.items.find((row) => row.id === input.itemId);
  if (!item) return { status: "not_found", message: "見つかりませんでした。" };
  if (item.status === "published" || item.status === "publishing") {
    return { status: "conflict", message: "公開済みの投稿は承認を変更できません。" };
  }

  if (!input.approved && item.xPostJobId) {
    try {
      await cancelDurableXPostJob({
        xPostJobId: item.xPostJobId,
        ownerId: input.ownerId,
      });
    } catch {
      /* keep going */
    }
  }

  let next: XPostBatchItem = {
    ...item,
    approvalStatus: input.approved ? "approved" : "pending",
    status: input.approved ? "approved" : "ready",
    xPostJobId: input.approved ? item.xPostJobId : null,
    idempotencyKey: input.approved ? item.idempotencyKey : null,
    errorMessage: null,
  };
  if (input.approved && next.scheduledFor) {
    const [scheduled] = await scheduleApprovedBatchItems({
      batch: found.batch,
      items: [next],
      context: input.context,
      checkConnection: input.checkConnection,
    });
    if (scheduled) next = scheduled;
  }
  next = await updateXPostBatchItem(next);
  const items = found.items.map((row) => (row.id === next.id ? next : row));
  const batch = await persistSummary(found.batch, items);
  return { status: "ready", batch, items };
}

export async function deleteOwnedXPostBatchItem(input: {
  ownerId: string;
  batchId: string;
  itemId: string;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  const item = found.items.find((row) => row.id === input.itemId);
  if (!item) return { status: "not_found", message: "見つかりませんでした。" };
  if (item.status === "published" || item.status === "publishing") {
    return { status: "conflict", message: "公開済みの投稿は削除できません。" };
  }
  if (item.xPostJobId) {
    try {
      await cancelDurableXPostJob({
        xPostJobId: item.xPostJobId,
        ownerId: input.ownerId,
      });
    } catch {
      /* keep going */
    }
  }
  await deleteXPostBatchItemForOwner({
    itemId: input.itemId,
    ownerId: input.ownerId,
  });
  const items = found.items.filter((row) => row.id !== input.itemId);
  const batch = await persistSummary(found.batch, items);
  return { status: "ready", batch, items };
}

export async function approveAllOwnedXPostBatch(input: {
  ownerId: string;
  batchId: string;
  context: FeatureAccessContext;
  checkConnection?: BatchConnectionChecker;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  const prepared = found.items.map((item) =>
    item.status === "published" || item.status === "publishing" || item.status === "failed"
      ? item
      : {
          ...item,
          approvalStatus: "approved" as const,
          status: "approved" as const,
          errorMessage: null,
        },
  );
  const scheduled = await scheduleApprovedBatchItems({
    batch: found.batch,
    items: prepared,
    context: input.context,
    checkConnection: input.checkConnection,
  });
  const items = await persistItems(scheduled);
  const batch = await persistSummary(found.batch, items);
  return { status: "ready", batch, items };
}

export async function regenerateSelectedOwnedItems(input: {
  ownerId: string;
  batchId: string;
  itemIds: string[];
  generate?: BatchCopyGenerator;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  const selected = new Set(input.itemIds);
  const memory = await resolveMemorySettings({
    ownerId: input.ownerId,
    batch: found.batch,
  });
  const items = [...found.items];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    if (!selected.has(item.id)) continue;
    const recentTexts = items
      .filter((row) => row.id !== item.id && row.text.trim())
      .map((row) => row.text);
    items[i] = await updateXPostBatchItem(
      await regenerateSingleBatchItem({
        batch: found.batch,
        item,
        settings: memory.settings,
        memoryGuidance: memory.guidance,
        recentTexts,
        generate: input.generate,
      }),
    );
  }
  const batch = await persistSummary(found.batch, items);
  return { status: "ready", batch, items };
}

export async function deleteSelectedOwnedItems(input: {
  ownerId: string;
  batchId: string;
  itemIds: string[];
}): Promise<XPostBatchServiceResult> {
  let last: XPostBatchServiceResult | null = null;
  for (const itemId of input.itemIds) {
    last = await deleteOwnedXPostBatchItem({
      ownerId: input.ownerId,
      batchId: input.batchId,
      itemId,
    });
    if (last.status !== "ready") return last;
  }
  return (
    last ??
    (await getOwnedXPostBatch({
      ownerId: input.ownerId,
      batchId: input.batchId,
    }))
  );
}

export async function redistributeOwnedXPostBatch(input: {
  ownerId: string;
  batchId: string;
  context: FeatureAccessContext;
  checkConnection?: BatchConnectionChecker;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  const targets = found.items.filter(
    (item) =>
      item.approvalStatus === "approved" &&
      item.status !== "published" &&
      item.status !== "publishing",
  );
  const occupied = await listOccupiedScheduleInstants({ ownerId: input.ownerId });
  for (const item of found.items) {
    if (item.scheduledFor && !targets.some((target) => target.id === item.id)) {
      occupied.add(item.scheduledFor);
    }
  }
  const slots = distributeBatchSchedule({
    startDate: found.batch.startDate,
    endDate: found.batch.endDate,
    daysOfWeek: found.batch.daysOfWeek,
    postTime: found.batch.postTime,
    timezone: found.batch.timezone,
    count: targets.length,
    occupiedUtc: occupied,
  });
  const remapped = found.items.map((item) => {
    const index = targets.findIndex((target) => target.id === item.id);
    if (index < 0) return item;
    return { ...item, scheduledFor: slots[index]?.scheduledFor ?? null };
  });
  const scheduled = await scheduleApprovedBatchItems({
    batch: found.batch,
    items: remapped,
    context: input.context,
    checkConnection: input.checkConnection,
  });
  const items = await persistItems(scheduled);
  const batch = await persistSummary(found.batch, items);
  return { status: "ready", batch, items };
}

export async function retryFailedOwnedXPostBatch(input: {
  ownerId: string;
  batchId: string;
  context: FeatureAccessContext;
  generate?: BatchCopyGenerator;
  checkConnection?: BatchConnectionChecker;
  signal?: AbortSignal;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  const failed = found.items.filter((item) => item.status === "failed");
  if (failed.length === 0) {
    return { status: "ready", ...found };
  }
  const reset = found.items.map((item) =>
    item.status === "failed"
      ? { ...item, text: "", status: "generating" as const, errorMessage: null }
      : item,
  );
  const generating = await updateXPostBatch({
    ...found.batch,
    status: "generating",
    generationAttempts: found.batch.generationAttempts + 1,
  });
  return continueBatchGeneration({
    ownerId: input.ownerId,
    batch: generating,
    items: reset,
    context: input.context,
    generate: input.generate,
    checkConnection: input.checkConnection,
    signal: input.signal,
  });
}

export async function cancelOwnedXPostBatch(input: {
  ownerId: string;
  batchId: string;
}): Promise<XPostBatchServiceResult> {
  const found = await requireOwnedBatch(input);
  if (!found) return { status: "not_found", message: "見つかりませんでした。" };
  const items: XPostBatchItem[] = [];
  for (const item of found.items) {
    if (item.xPostJobId && item.status !== "published" && item.status !== "publishing") {
      try {
        await cancelDurableXPostJob({
          xPostJobId: item.xPostJobId,
          ownerId: input.ownerId,
        });
      } catch {
        /* keep going */
      }
    }
    items.push(
      await updateXPostBatchItem({
        ...item,
        status:
          item.status === "published" || item.status === "publishing"
            ? item.status
            : "cancelled",
      }),
    );
  }
  const batch = await persistSummary(found.batch, items, { cancelRequested: true });
  return { status: "ready", batch, items };
}

export async function getOwnedXPostBatchItem(input: {
  ownerId: string;
  itemId: string;
}): Promise<XPostBatchItem | null> {
  return getXPostBatchItemForOwner(input);
}

export function assertBatchCountLimit(count: number): boolean {
  return isAllowedXPostBatchCount(count);
}

export type { XPostBatchApprovalMode };
