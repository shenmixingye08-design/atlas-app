import { afterEach, describe, expect, it } from "vitest";

import {
  getXPostBatchMaxCount,
  isAllowedXPostBatchCount,
  parseXPostBatchCount,
  X_POST_BATCH_COUNT_OPTIONS,
  X_POST_BATCH_DEFAULT_MAX_COUNT,
} from "./batch-config";

describe("X post batch config", () => {
  const previous = process.env.ATLAS_X_POST_BATCH_MAX_COUNT;

  afterEach(() => {
    if (previous == null) delete process.env.ATLAS_X_POST_BATCH_MAX_COUNT;
    else process.env.ATLAS_X_POST_BATCH_MAX_COUNT = previous;
  });

  it("defaults to 12 and allows only the published options", () => {
    delete process.env.ATLAS_X_POST_BATCH_MAX_COUNT;
    expect(getXPostBatchMaxCount()).toBe(X_POST_BATCH_DEFAULT_MAX_COUNT);
    expect(X_POST_BATCH_COUNT_OPTIONS).toEqual([1, 3, 7, 12]);
    expect(isAllowedXPostBatchCount(12)).toBe(true);
    expect(isAllowedXPostBatchCount(13)).toBe(false);
    expect(parseXPostBatchCount("7")).toBe(7);
    expect(parseXPostBatchCount(99)).toBeNull();
  });

  it("reads a server-side max override", () => {
    process.env.ATLAS_X_POST_BATCH_MAX_COUNT = "7";
    expect(getXPostBatchMaxCount()).toBe(7);
    expect(isAllowedXPostBatchCount(12)).toBe(false);
    expect(isAllowedXPostBatchCount(7)).toBe(true);
  });
});
