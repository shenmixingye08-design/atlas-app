import { DELIVERABLE_BATCH_COUNTS } from "./types";

export const DELIVERABLE_BATCH_DEFAULT_MAX_ITEMS = 12;
export const DELIVERABLE_BATCH_CONCURRENCY = 2;
export const DELIVERABLE_BATCH_MAX_RETRIES = 2;
export const DELIVERABLE_BATCH_MAX_DUPLICATE_RETRIES = 2;
export const DELIVERABLE_BATCH_MAX_CONCURRENT_GENERATING = 1;
export const DELIVERABLE_BATCH_PAYLOAD_CHARS = 40_000;
export const DELIVERABLE_BATCH_MAX_ATTACHMENT_ITEMS = 12;

export const DELIVERABLE_BATCH_RATE_LIMIT = {
  bucket: "deliverable-batch",
  max: 8,
  windowMs: 60 * 60 * 1000,
  minIntervalMs: 2_000,
} as const;

export function resolveDeliverableBatchMaxItems(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.ATLAS_DELIVERABLE_BATCH_MAX_ITEMS);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.min(DELIVERABLE_BATCH_DEFAULT_MAX_ITEMS, Math.floor(raw));
  }
  return DELIVERABLE_BATCH_DEFAULT_MAX_ITEMS;
}

export function isAllowedDeliverableBatchCount(count: number): boolean {
  return (DELIVERABLE_BATCH_COUNTS as readonly number[]).includes(count);
}
