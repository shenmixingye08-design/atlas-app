import type {
  XPostBatch,
  XPostBatchAction,
  XPostBatchInput,
  XPostBatchItem,
  XPostBatchStatus,
} from "./batch-types";
import { X_POST_BATCH_COUNT_OPTIONS } from "./batch-config";
import { X_AUTOPOST_WEEKDAY_LABELS } from "./autopost-types";

export type { XPostBatch, XPostBatchInput, XPostBatchItem, XPostBatchStatus };
export { X_POST_BATCH_COUNT_OPTIONS, X_AUTOPOST_WEEKDAY_LABELS };

export const X_POST_BATCH_FIELD_CLASS =
  "min-h-[44px] h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";

export const X_POST_BATCH_SAFE_BOTTOM =
  "pb-[calc(5.5rem+env(safe-area-inset-bottom))]";

export type XPostBatchListResult =
  | { status: "ready"; batches: XPostBatch[] }
  | { status: "unauthorized"; message: string };

export type XPostBatchDetailResult =
  | { status: "ready"; batch: XPostBatch; items: XPostBatchItem[] }
  | {
      status:
        | "unauthorized"
        | "not_found"
        | "feature_disabled"
        | "plan_limited"
        | "validation_failed"
        | "rate_limited"
        | "conflict"
        | "error";
      message: string;
    };

async function readResult(response: Response): Promise<XPostBatchDetailResult> {
  const body = (await response.json().catch(() => null)) as
    | XPostBatchDetailResult
    | null;
  if (body && "status" in body) return body;
  return {
    status: "error",
    message: "まとめて作成の処理に失敗しました。",
  };
}

export async function listXPostBatchesClient(): Promise<XPostBatchListResult> {
  const response = await fetch("/api/x/posts/batch", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as
    | XPostBatchListResult
    | null;
  if (body && "status" in body) return body;
  return { status: "unauthorized", message: "ログインしてください。" };
}

export async function createXPostBatchClient(
  input: XPostBatchInput,
): Promise<XPostBatchDetailResult> {
  const response = await fetch("/api/x/posts/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readResult(response);
}

export async function getXPostBatchClient(
  batchId: string,
): Promise<XPostBatchDetailResult> {
  const response = await fetch(`/api/x/posts/batch/${batchId}`, {
    cache: "no-store",
  });
  return readResult(response);
}

export async function patchXPostBatchItemClient(input: {
  batchId: string;
  itemId: string;
  text?: string;
  scheduledFor?: string | null;
  approved?: boolean;
  regenerate?: boolean;
}): Promise<XPostBatchDetailResult> {
  const response = await fetch(
    `/api/x/posts/batch/${input.batchId}/items/${input.itemId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        scheduledFor: input.scheduledFor,
        approved: input.approved,
        regenerate: input.regenerate,
      }),
    },
  );
  return readResult(response);
}

export async function deleteXPostBatchItemClient(input: {
  batchId: string;
  itemId: string;
}): Promise<XPostBatchDetailResult> {
  const response = await fetch(
    `/api/x/posts/batch/${input.batchId}/items/${input.itemId}`,
    { method: "DELETE" },
  );
  return readResult(response);
}

export async function runXPostBatchActionClient(input: {
  batchId: string;
  action: XPostBatchAction;
  itemIds?: string[];
}): Promise<XPostBatchDetailResult> {
  const response = await fetch(`/api/x/posts/batch/${input.batchId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: input.action,
      itemIds: input.itemIds ?? [],
    }),
  });
  return readResult(response);
}

export function formatBatchStatus(status: XPostBatchStatus): string {
  const labels: Record<XPostBatchStatus, string> = {
    draft: "下書き",
    generating: "作成中",
    partially_failed: "一部失敗",
    ready: "確認待ち",
    approved: "承認済み",
    scheduled: "予約済み",
    publishing: "投稿中",
    published: "投稿済み",
    failed: "失敗",
    cancelled: "取消済み",
  };
  return labels[status];
}

export function formatBatchDateTime(iso: string | null, timeZone: string): string {
  if (!iso) return "未設定";
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone,
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
