import "server-only";

import { randomUUID } from "node:crypto";

import {
  DELIVERABLE_BATCH_CONCURRENCY,
  DELIVERABLE_BATCH_MAX_CONCURRENT_GENERATING,
  DELIVERABLE_BATCH_MAX_DUPLICATE_RETRIES,
  DELIVERABLE_BATCH_MAX_RETRIES,
  resolveDeliverableBatchMaxItems,
} from "./config";
import { buildItemAssignment, emptyCommon, styleNoteFromContent } from "./compose";
import { findDuplicateItems } from "./duplication";
import {
  ensureDeliverableBatchesHydrated,
  persistDeliverableBatchesNow,
} from "./durable";
import { evaluateDeliverableBatchEntitlement } from "./entitlement";
import { generateDeliverableBatchItemArtifact } from "./generate";
import {
  parseAttachmentItems,
  parseLineList,
  parseSpreadsheetRows,
} from "./parse-input";
import { canRetryItem, isSuccessfulItem, summarizeBatchStatus } from "./status";
import {
  countGeneratingBatches,
  deleteDeliverableBatchItemRecord,
  listDeliverableBatchItems,
  readDeliverableBatch,
  readDeliverableBatchItem,
  readDeliverableBatchWithItems,
  writeDeliverableBatch,
  writeDeliverableBatchItem,
} from "./store";
import {
  deleteDeliverableBatchItemRow,
  upsertDeliverableBatchItemRow,
  upsertDeliverableBatchRow,
} from "./table";
import { splitThemesDeterministically } from "./theme-split";
import type {
  CreateDeliverableBatchInput,
  DeliverableBatch,
  DeliverableBatchItem,
  DeliverableBatchWithItems,
} from "./types";
import { DELIVERABLE_BATCH_LIVE_FORMATS } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function persist(userId: string): void {
  void persistDeliverableBatchesNow(userId).catch(() => undefined);
}

function saveBatch(batch: DeliverableBatch, items?: DeliverableBatchItem[]): void {
  writeDeliverableBatch(batch);
  void upsertDeliverableBatchRow(batch).catch(() => undefined);
  for (const item of items ?? []) {
    writeDeliverableBatchItem(item);
    void upsertDeliverableBatchItemRow(item).catch(() => undefined);
  }
  persist(batch.userId);
}

function refreshBatchStatus(
  userId: string,
  batchId: string,
  flags?: Parameters<typeof summarizeBatchStatus>[1],
): DeliverableBatch | null {
  const batch = readDeliverableBatch(userId, batchId);
  if (!batch) return null;
  const items = listDeliverableBatchItems(userId, batchId);
  const next = {
    ...batch,
    status: summarizeBatchStatus(items, {
      cancelled: batch.cancelled,
      ...flags,
    }),
    updatedAt: nowIso(),
  };
  writeDeliverableBatch(next);
  persist(userId);
  return next;
}

function resolveItems(input: CreateDeliverableBatchInput) {
  switch (input.inputType) {
    case "line_list":
      return parseLineList((input.lines ?? []).join("\n"));
    case "spreadsheet":
      return parseSpreadsheetRows(input.spreadsheetRows ?? [], input.columnMap);
    case "attachments":
      return parseAttachmentItems(input.attachments ?? []);
    case "ai_themes":
    default:
      return {
        items: splitThemesDeterministically(
          input.sharedInstruction,
          input.requestedCount,
        ),
        emptyDropped: 0,
        duplicateWarnings: [] as string[],
      };
  }
}

export async function createDeliverableBatch(
  userId: string,
  input: CreateDeliverableBatchInput,
): Promise<{ ok: true; view: DeliverableBatchWithItems } | { ok: false; error: string }> {
  await ensureDeliverableBatchesHydrated(userId);
  if (
    !(DELIVERABLE_BATCH_LIVE_FORMATS as readonly string[]).includes(input.format)
  ) {
    return { ok: false, error: "この形式は現在お使いいただけません。" };
  }
  const entitlement = evaluateDeliverableBatchEntitlement({
    userId,
    requestedCount: input.requestedCount,
    format: input.format,
  });
  if (!entitlement.allowed) {
    return { ok: false, error: entitlement.reason ?? "作成できません。" };
  }
  if (countGeneratingBatches(userId) >= DELIVERABLE_BATCH_MAX_CONCURRENT_GENERATING) {
    return { ok: false, error: "いま生成中のまとめて作成があります。完了後にお進みください。" };
  }

  const parsed = resolveItems(input);
  const maxItems = resolveDeliverableBatchMaxItems();
  const sliced = parsed.items.slice(0, Math.min(input.requestedCount, maxItems));
  if (sliced.length === 0) {
    return { ok: false, error: "作成する項目がありません。" };
  }

  const at = nowIso();
  const batchId = newId("dlb");
  const batch: DeliverableBatch = {
    id: batchId,
    userId,
    name: (input.name?.trim() || input.sharedInstruction || "まとめて作成").slice(0, 80),
    inputType: input.inputType,
    common: { ...emptyCommon(), ...input.common },
    format: input.format,
    requestedCount: sliced.length,
    status: "draft",
    sampleItemId: null,
    sampleApproved: false,
    sampleStyleNote: null,
    styleCandidate: null,
    duplicateWarnings: parsed.duplicateWarnings,
    cancelled: false,
    createdAt: at,
    updatedAt: at,
  };
  const items = sliced.map((row, order) => {
    const itemId = newId("dli");
    return {
      id: itemId,
      batchId,
      userId,
      order,
      inputType: input.inputType,
      inputReference: row.attachmentId ?? row.title,
      title: row.title,
      theme: row.theme,
      individualInstruction: row.instruction,
      forbidden: row.forbidden ?? "",
      fileName: row.fileName ?? null,
      outputFormat: input.format,
      outputArtifactId: null,
      workJobId: null,
      sourceContent: null,
      status: "pending" as const,
      retryCount: 0,
      error: null,
      edited: false,
      approvedAt: null,
      createdAt: at,
      updatedAt: at,
    } satisfies DeliverableBatchItem;
  });
  saveBatch(batch, items);
  return { ok: true, view: { batch, items } };
}

async function generateOne(
  userId: string,
  batch: DeliverableBatch,
  item: DeliverableBatchItem,
  origin: string,
): Promise<DeliverableBatchItem> {
  if (isSuccessfulItem(item.status) && item.outputArtifactId) return item;
  const running: DeliverableBatchItem = {
    ...item,
    status: "generating",
    updatedAt: nowIso(),
  };
  writeDeliverableBatchItem(running);
  void upsertDeliverableBatchItemRow(running).catch(() => undefined);
  const assignment = buildItemAssignment(batch, running, batch.sampleStyleNote);
  try {
    const generated = await generateDeliverableBatchItemArtifact({
      userId,
      batch,
      item: running,
      assignment,
      origin,
    });
    const next: DeliverableBatchItem = {
      ...running,
      sourceContent: generated.sourceContent ?? running.sourceContent,
      outputArtifactId: generated.ok ? generated.artifactId ?? null : null,
      fileName: generated.ok ? generated.fileName ?? running.fileName : running.fileName,
      status: generated.ok ? "ready" : "failed",
      error: generated.ok ? null : generated.error ?? "作成に失敗しました。",
      updatedAt: nowIso(),
    };
    writeDeliverableBatchItem(next);
    void upsertDeliverableBatchItemRow(next).catch(() => undefined);
    return next;
  } catch (error) {
    const next: DeliverableBatchItem = {
      ...running,
      status: "failed",
      error: error instanceof Error ? error.message : "作成に失敗しました。",
      updatedAt: nowIso(),
    };
    writeDeliverableBatchItem(next);
    void upsertDeliverableBatchItemRow(next).catch(() => undefined);
    return next;
  }
}

async function generateQueued(
  userId: string,
  batchId: string,
  itemIds: string[],
  origin: string,
): Promise<void> {
  const queue = [...itemIds];
  const workers = Array.from(
    { length: Math.min(DELIVERABLE_BATCH_CONCURRENCY, queue.length) },
    async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) break;
        const batch = readDeliverableBatch(userId, batchId);
        const item = readDeliverableBatchItem(userId, id);
        if (!batch || batch.cancelled || !item) continue;
        if (isSuccessfulItem(item.status) && item.outputArtifactId) continue;
        await generateOne(userId, batch, item, origin);
      }
    },
  );
  await Promise.all(workers);
}

export async function generateDeliverableBatchSample(
  userId: string,
  batchId: string,
  origin: string,
): Promise<DeliverableBatchWithItems | null> {
  await ensureDeliverableBatchesHydrated(userId);
  const current = readDeliverableBatchWithItems(userId, batchId);
  if (!current || current.batch.cancelled) return current;
  const sample = current.items[0];
  if (!sample) return current;
  writeDeliverableBatch({
    ...current.batch,
    status: "generating_sample",
    sampleItemId: sample.id,
    updatedAt: nowIso(),
  });
  void upsertDeliverableBatchRow({
    ...current.batch,
    status: "generating_sample",
    sampleItemId: sample.id,
    updatedAt: nowIso(),
  }).catch(() => undefined);
  await generateOne(userId, readDeliverableBatch(userId, batchId) ?? current.batch, sample, origin);
  const after = readDeliverableBatchItem(userId, sample.id);
  if (after?.sourceContent) {
    writeDeliverableBatch({
      ...(readDeliverableBatch(userId, batchId) ?? current.batch),
      sampleItemId: sample.id,
      sampleStyleNote: styleNoteFromContent(after.sourceContent),
      updatedAt: nowIso(),
    });
  }
  refreshBatchStatus(userId, batchId, {
    sampleOnly: true,
    sampleReady: after?.status === "ready",
    generatingSample: false,
  });
  return readDeliverableBatchWithItems(userId, batchId);
}

export async function generateDeliverableBatchRemaining(
  userId: string,
  batchId: string,
  origin: string,
  options?: { approveSample?: boolean; styleNote?: string; applyStyleCandidate?: boolean },
): Promise<DeliverableBatchWithItems | null> {
  await ensureDeliverableBatchesHydrated(userId);
  const current = readDeliverableBatchWithItems(userId, batchId);
  if (!current || current.batch.cancelled) return current;
  if (options?.approveSample) {
    const nextStyle = options.applyStyleCandidate
      ? options.styleNote?.trim() || current.batch.styleCandidate || current.batch.sampleStyleNote
      : options.styleNote?.trim() || current.batch.sampleStyleNote;
    writeDeliverableBatch({
      ...current.batch,
      sampleApproved: true,
      sampleStyleNote: nextStyle,
      styleCandidate: options.applyStyleCandidate ? null : current.batch.styleCandidate,
      updatedAt: nowIso(),
    });
  }
  writeDeliverableBatch({
    ...(readDeliverableBatch(userId, batchId) ?? current.batch),
    status: "generating",
    updatedAt: nowIso(),
  });
  const pending = current.items
    .filter((item) => !isSuccessfulItem(item.status) || !item.outputArtifactId)
    .map((item) => item.id);
  await generateQueued(userId, batchId, pending, origin);
  await regenerateDuplicates(userId, batchId, origin);
  refreshBatchStatus(userId, batchId);
  return readDeliverableBatchWithItems(userId, batchId);
}

async function regenerateDuplicates(
  userId: string,
  batchId: string,
  origin: string,
): Promise<void> {
  let attempts = 0;
  while (attempts < DELIVERABLE_BATCH_MAX_DUPLICATE_RETRIES) {
    const items = listDeliverableBatchItems(userId, batchId);
    const hits = findDuplicateItems(items);
    const ids = [...new Set(hits.map((hit) => hit.itemId))];
    if (ids.length === 0) return;
    for (const id of ids) {
      const item = readDeliverableBatchItem(userId, id);
      if (!item || item.retryCount >= DELIVERABLE_BATCH_MAX_RETRIES) continue;
      writeDeliverableBatchItem({
        ...item,
        status: "pending",
        outputArtifactId: null,
        retryCount: item.retryCount + 1,
        error: "内容が他の項目と重なったため、作り直します。",
        updatedAt: nowIso(),
      });
    }
    await generateQueued(userId, batchId, ids, origin);
    attempts += 1;
  }
}

export async function retryFailedDeliverableBatchItems(
  userId: string,
  batchId: string,
  origin: string,
  itemIds?: string[],
): Promise<DeliverableBatchWithItems | null> {
  await ensureDeliverableBatchesHydrated(userId);
  const current = readDeliverableBatchWithItems(userId, batchId);
  if (!current || current.batch.cancelled) return current;
  const targets = current.items.filter((item) => {
    if (itemIds && !itemIds.includes(item.id)) return false;
    if (isSuccessfulItem(item.status) && item.outputArtifactId) return false;
    return canRetryItem(item.status) || item.status === "failed";
  });
  for (const item of targets) {
    writeDeliverableBatchItem({
      ...item,
      status: "pending",
      retryCount: item.retryCount + 1,
      error: null,
      updatedAt: nowIso(),
    });
  }
  writeDeliverableBatch({
    ...current.batch,
    status: "generating",
    updatedAt: nowIso(),
  });
  await generateQueued(
    userId,
    batchId,
    targets.map((item) => item.id),
    origin,
  );
  refreshBatchStatus(userId, batchId);
  return readDeliverableBatchWithItems(userId, batchId);
}

export async function cancelDeliverableBatch(
  userId: string,
  batchId: string,
): Promise<DeliverableBatchWithItems | null> {
  await ensureDeliverableBatchesHydrated(userId);
  const current = readDeliverableBatchWithItems(userId, batchId);
  if (!current) return null;
  writeDeliverableBatch({
    ...current.batch,
    cancelled: true,
    status: "cancelled",
    updatedAt: nowIso(),
  });
  for (const item of current.items) {
    if (!isSuccessfulItem(item.status)) {
      writeDeliverableBatchItem({
        ...item,
        status: "cancelled",
        updatedAt: nowIso(),
      });
    }
  }
  persist(userId);
  return readDeliverableBatchWithItems(userId, batchId);
}

export async function updateDeliverableBatchItem(
  userId: string,
  itemId: string,
  patch: Partial<
    Pick<
      DeliverableBatchItem,
      "title" | "individualInstruction" | "fileName" | "status" | "sourceContent"
    >
  >,
): Promise<DeliverableBatchItem | null> {
  await ensureDeliverableBatchesHydrated(userId);
  const item = readDeliverableBatchItem(userId, itemId);
  if (!item) return null;
  const next: DeliverableBatchItem = {
    ...item,
    title: patch.title ?? item.title,
    individualInstruction: patch.individualInstruction ?? item.individualInstruction,
    fileName: patch.fileName ?? item.fileName,
    sourceContent: patch.sourceContent ?? item.sourceContent,
    status: patch.status ?? item.status,
    edited: Boolean(patch.sourceContent || patch.individualInstruction) || item.edited,
    approvedAt:
      patch.status === "approved" ? nowIso() : patch.status === "ready" ? null : item.approvedAt,
    updatedAt: nowIso(),
  };
  writeDeliverableBatchItem(next);
  void upsertDeliverableBatchItemRow(next).catch(() => undefined);
  const batch = readDeliverableBatch(userId, item.batchId);
  if (batch && batch.sampleItemId === item.id && patch.sourceContent) {
    const candidate = styleNoteFromContent(patch.sourceContent);
    writeDeliverableBatch({
      ...batch,
      styleCandidate: candidate,
      updatedAt: nowIso(),
    });
    void upsertDeliverableBatchRow({
      ...batch,
      styleCandidate: candidate,
      updatedAt: nowIso(),
    }).catch(() => undefined);
  }
  refreshBatchStatus(userId, item.batchId);
  return next;
}

export async function deleteDeliverableBatchItems(
  userId: string,
  batchId: string,
  itemIds: string[],
): Promise<DeliverableBatchWithItems | null> {
  await ensureDeliverableBatchesHydrated(userId);
  const current = readDeliverableBatchWithItems(userId, batchId);
  if (!current) return null;
  for (const id of itemIds) {
    const item = readDeliverableBatchItem(userId, id);
    if (!item || item.batchId !== batchId) continue;
    deleteDeliverableBatchItemRecord(userId, id);
    void deleteDeliverableBatchItemRow(userId, id).catch(() => undefined);
  }
  const remaining = listDeliverableBatchItems(userId, batchId);
  if (remaining.length === 0) {
    writeDeliverableBatch({
      ...current.batch,
      cancelled: true,
      status: "cancelled",
      updatedAt: nowIso(),
    });
  } else {
    refreshBatchStatus(userId, batchId);
  }
  persist(userId);
  return readDeliverableBatchWithItems(userId, batchId);
}

export async function regenerateSelectedDeliverableBatchItems(
  userId: string,
  batchId: string,
  origin: string,
  itemIds: string[],
): Promise<DeliverableBatchWithItems | null> {
  await ensureDeliverableBatchesHydrated(userId);
  const current = readDeliverableBatchWithItems(userId, batchId);
  if (!current || current.batch.cancelled) return current;
  const targets = current.items.filter((item) => itemIds.includes(item.id));
  for (const item of targets) {
    if (item.retryCount >= DELIVERABLE_BATCH_MAX_RETRIES && isSuccessfulItem(item.status)) {
      continue;
    }
    writeDeliverableBatchItem({
      ...item,
      status: "pending",
      outputArtifactId: isSuccessfulItem(item.status) ? null : item.outputArtifactId,
      retryCount: item.retryCount + 1,
      error: null,
      updatedAt: nowIso(),
    });
  }
  writeDeliverableBatch({
    ...current.batch,
    status: "generating",
    updatedAt: nowIso(),
  });
  await generateQueued(userId, batchId, targets.map((item) => item.id), origin);
  refreshBatchStatus(userId, batchId);
  return readDeliverableBatchWithItems(userId, batchId);
}

export async function cloneDeliverableBatch(
  userId: string,
  batchId: string,
): Promise<DeliverableBatchWithItems | null> {
  await ensureDeliverableBatchesHydrated(userId);
  const current = readDeliverableBatchWithItems(userId, batchId);
  if (!current) return null;
  return createDeliverableBatch(userId, {
    name: `${current.batch.name}のコピー`,
    inputType: current.batch.inputType,
    common: current.batch.common,
    format: current.batch.format,
    requestedCount: current.items.length,
    sharedInstruction: current.batch.name,
    lines: current.items.map((item) => item.title),
  }).then((result) => (result.ok ? result.view : null));
}

export async function getDeliverableBatchView(
  userId: string,
  batchId: string,
): Promise<DeliverableBatchWithItems | null> {
  await ensureDeliverableBatchesHydrated(userId);
  return readDeliverableBatchWithItems(userId, batchId);
}

export async function listUserDeliverableBatches(userId: string) {
  await ensureDeliverableBatchesHydrated(userId);
  return (await import("./store")).listDeliverableBatches(userId);
}
