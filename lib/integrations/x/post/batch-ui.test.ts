import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  X_POST_BATCH_COUNT_OPTIONS,
  X_POST_BATCH_TOUCH_MIN_PX,
} from "./batch-config";
import {
  X_POST_BATCH_FIELD_CLASS,
  X_POST_BATCH_SAFE_BOTTOM,
} from "./batch-client";

describe("X post batch mobile UI", () => {
  it("exposes 1/3/7/12 and a 44px touch target", () => {
    expect(X_POST_BATCH_COUNT_OPTIONS).toEqual([1, 3, 7, 12]);
    expect(X_POST_BATCH_TOUCH_MIN_PX).toBe(44);
    expect(X_POST_BATCH_FIELD_CLASS).toContain("min-h-[44px]");
    expect(X_POST_BATCH_SAFE_BOTTOM).toContain("safe-area-inset-bottom");
  });

  it("keeps the panel usable at 360 and 390 widths", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workspace/x-post-batch-panel.tsx"),
      "utf8",
    );
    expect(source).toContain("min-h-[44px]");
    expect(source).toContain("grid-cols-2");
    expect(source).toContain("X_POST_BATCH_SAFE_BOTTOM");
    expect(source).toContain("{count}件");
    expect(source).toContain("copy.title");
    expect(source).toContain("X_POST_BATCH_COUNT_OPTIONS");
  });
});
