import type {
  DeliverableBatchItem,
  DeliverableBatchItemStatus,
  DeliverableBatchStatus,
} from "./types";

export function summarizeBatchStatus(
  items: DeliverableBatchItem[],
  flags: {
    cancelled?: boolean;
    sampleOnly?: boolean;
    sampleReady?: boolean;
    generatingSample?: boolean;
    generating?: boolean;
  } = {},
): DeliverableBatchStatus {
  if (flags.cancelled) return "cancelled";
  if (items.length === 0) return "draft";
  if (flags.generatingSample) return "generating_sample";
  if (flags.sampleOnly && flags.sampleReady) return "sample_ready";
  if (flags.generating) return "generating";

  const active = items.filter((item) => item.status !== "cancelled");
  if (active.length === 0) return "cancelled";
  const failed = active.filter((item) => item.status === "failed");
  const pending = active.filter(
    (item) => item.status === "pending" || item.status === "generating",
  );
  const ready = active.filter(
    (item) => item.status === "ready" || item.status === "approved",
  );
  const approved = active.filter((item) => item.status === "approved");

  if (pending.length > 0) return "generating";
  if (failed.length > 0 && ready.length > 0) return "partially_failed";
  if (failed.length > 0 && ready.length === 0) return "partially_failed";
  if (approved.length === active.length) return "completed";
  if (ready.length === active.length) return "ready";
  return "draft";
}

export function canRetryItem(status: DeliverableBatchItemStatus): boolean {
  return status === "failed" || status === "pending";
}

export function isSuccessfulItem(status: DeliverableBatchItemStatus): boolean {
  return status === "ready" || status === "approved";
}
