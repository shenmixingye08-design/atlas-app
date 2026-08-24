/**
 * Server-side limits for X batch creation.
 * Stripe prices / plan names are not changed here.
 */

export const X_POST_BATCH_COUNT_OPTIONS = [1, 3, 7, 12] as const;

export type XPostBatchCountOption = (typeof X_POST_BATCH_COUNT_OPTIONS)[number];

export const X_POST_BATCH_DEFAULT_MAX_COUNT = 12;
export const X_POST_BATCH_CHUNK_SIZE = 3;
export const X_POST_BATCH_MAX_REGENERATE_PER_ITEM = 3;
export const X_POST_BATCH_MAX_DEDUP_ROUNDS = 2;
export const X_POST_BATCH_MAX_CONCURRENT_PER_USER = 1;
export const X_POST_BATCH_ITEM_TIMEOUT_MS = 20_000;
export const X_POST_BATCH_OVERALL_TIMEOUT_MS = 90_000;
export const X_POST_BATCH_DEFAULT_TIMEZONE = "Asia/Tokyo";
export const X_POST_BATCH_TOUCH_MIN_PX = 44;
export const X_POST_BATCH_SIMILARITY_THRESHOLD = 0.78;

export const X_POST_BATCH_RATE_LIMIT = {
  bucket: "x-post-batch",
  max: 8,
  windowMs: 60 * 60 * 1000,
  minIntervalMs: 2_000,
} as const;

export function getXPostBatchMaxCount(): number {
  const raw = Number(process.env.ATLAS_X_POST_BATCH_MAX_COUNT);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 48) {
    return Math.trunc(raw);
  }
  return X_POST_BATCH_DEFAULT_MAX_COUNT;
}

export function isAllowedXPostBatchCount(count: number): boolean {
  const max = getXPostBatchMaxCount();
  return (
    Number.isInteger(count) &&
    count >= 1 &&
    count <= max &&
    (X_POST_BATCH_COUNT_OPTIONS as readonly number[]).includes(count)
  );
}

export function parseXPostBatchCount(value: unknown): number | null {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count)) return null;
  return isAllowedXPostBatchCount(count) ? count : null;
}
