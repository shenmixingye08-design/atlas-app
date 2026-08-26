/**
 * Client-safe types for X batch post creation.
 * Status names follow the requested batch review model.
 * Publish still uses existing atlas_x_post_jobs statuses.
 */

export const X_POST_BATCH_STATUSES = [
  "draft",
  "generating",
  "partially_failed",
  "ready",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
] as const;

export type XPostBatchStatus = (typeof X_POST_BATCH_STATUSES)[number];

export const X_POST_BATCH_ITEM_STATUSES = [
  "draft",
  "generating",
  "ready",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
] as const;

export type XPostBatchItemStatus = (typeof X_POST_BATCH_ITEM_STATUSES)[number];

export type XPostBatchApprovalStatus = "pending" | "approved" | "rejected";

export type XPostBatchApprovalMode = "approval" | "full_auto";

export type XPostBatchInput = {
  purpose: string;
  theme: string;
  audience: string;
  tone: string;
  includeContent: string;
  forbiddenContent: string;
  hashtagPolicy: string;
  count: number;
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  postTime: string;
  approvalMode: XPostBatchApprovalMode;
  timezone?: string;
};

export type XPostBatchItem = {
  id: string;
  batchId: string;
  ownerId: string;
  text: string;
  angle: string;
  theme: string;
  hashtags: string[];
  sequence: number;
  approvalStatus: XPostBatchApprovalStatus;
  scheduledFor: string | null;
  status: XPostBatchItemStatus;
  errorMessage: string | null;
  regenerateCount: number;
  xPostJobId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type XPostBatch = {
  id: string;
  ownerId: string;
  purpose: string;
  theme: string;
  audience: string;
  tone: string;
  includeContent: string;
  forbiddenContent: string;
  hashtagPolicy: string;
  requestedCount: number;
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  postTime: string;
  approvalMode: XPostBatchApprovalMode;
  timezone: string;
  status: XPostBatchStatus;
  cancelRequested: boolean;
  generationAttempts: number;
  costUsd: number;
  memoryApplied: boolean;
  memoryLabels: string[];
  memoryFailed: boolean;
  connectionError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type XPostBatchWithItems = {
  batch: XPostBatch;
  items: XPostBatchItem[];
};

export type XPostBatchAction =
  | "approve_all"
  | "regenerate_selected"
  | "delete_selected"
  | "redistribute"
  | "retry_failed"
  | "cancel";

export function isXPostBatchStatus(value: unknown): value is XPostBatchStatus {
  return (
    typeof value === "string" &&
    (X_POST_BATCH_STATUSES as readonly string[]).includes(value)
  );
}

export function isXPostBatchItemStatus(
  value: unknown,
): value is XPostBatchItemStatus {
  return (
    typeof value === "string" &&
    (X_POST_BATCH_ITEM_STATUSES as readonly string[]).includes(value)
  );
}

export function isXPostBatchApprovalMode(
  value: unknown,
): value is XPostBatchApprovalMode {
  return value === "approval" || value === "full_auto";
}

export function summarizeBatchStatus(
  items: readonly XPostBatchItem[],
  cancelRequested = false,
): XPostBatchStatus {
  if (cancelRequested) return "cancelled";
  if (items.length === 0) return "draft";

  const statuses = items.map((item) => item.status);
  if (statuses.every((status) => status === "published")) return "published";
  if (statuses.some((status) => status === "publishing")) return "publishing";
  if (statuses.every((status) => status === "scheduled" || status === "published")) {
    return "scheduled";
  }
  if (statuses.every((status) => status === "approved" || status === "scheduled" || status === "published")) {
    return "approved";
  }
  if (statuses.some((status) => status === "failed") && statuses.some((status) => status !== "failed")) {
    return "partially_failed";
  }
  if (statuses.every((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "generating")) return "generating";
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  return "ready";
}
