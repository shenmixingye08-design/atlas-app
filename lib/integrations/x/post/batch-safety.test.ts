import { describe, expect, it } from "vitest";

import {
  applyHashtagPolicy,
  detectUnsafeBatchClaims,
  sanitizeBatchPostText,
} from "./batch-safety";
import { isTooSimilar } from "./autopost-generator";

describe("X post batch safety", () => {
  it("rejects fabricated revenue and guarantee claims", () => {
    expect(detectUnsafeBatchClaims("売上を1200万円達成しました")).toContain("売上数値");
    expect(detectUnsafeBatchClaims("必ず成果が出ます")).toContain("効果保証");
    expect(sanitizeBatchPostText("受賞歴があります").replaced).toBe(true);
  });

  it("keeps safe general copy", () => {
    const safe = "今日の仕事を一つだけ前に進めることが近道です。";
    expect(detectUnsafeBatchClaims(safe)).toEqual([]);
    expect(sanitizeBatchPostText(safe).text).toBe(safe);
  });

  it("applies hashtag policy without inventing extra facts", () => {
    const none = applyHashtagPolicy({
      text: "仕事を進めましょう #仕事",
      policy: "付けない",
      theme: "仕事",
    });
    expect(none).not.toContain("#");
    const added = applyHashtagPolicy({
      text: "仕事を進めましょう",
      policy: "1個付ける",
      theme: "整理",
    });
    expect(added).toContain("#整理");
  });

  it("detects near-duplicate copy so only those items regenerate", () => {
    const a = "毎日の仕事を一つに絞ると、迷いが減ります。";
    const b = "毎日の仕事を一つに絞ると、迷いが減ります。";
    const c = "読み手に問いかけて、次の一歩を一緒に考えます。";
    expect(isTooSimilar(b, [a], 0.78)).toBe(true);
    expect(isTooSimilar(c, [a], 0.78)).toBe(false);
  });
});
