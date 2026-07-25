import { describe, expect, it } from "vitest";

import {
  emptyDeliverable,
  type Deliverable,
} from "@/lib/orchestration/deliverable-types";

import {
  evaluateDeliverableQuality,
  mergeQualityIntoDeterministicFeedback,
} from "./evaluate";

function deliverable(partial: Partial<Deliverable>): Deliverable {
  return {
    ...emptyDeliverable("document"),
    title: "資料",
    summary: "要約",
    content: "本文",
    markdown: "本文",
    plainText: "本文",
    ...partial,
  };
}

describe("deliverable quality evaluate", () => {
  it("flags excel formula errors as major", () => {
    const result = evaluateDeliverableQuality({
      deliverable: deliverable({
        type: "report",
        content: "売上 #REF! があります",
        markdown: "売上 #REF! があります",
      }),
      assignment: "Excelの集計表を作って xlsx",
      baseScore: 92,
    });
    expect(result.kind).toBe("excel");
    expect(result.majorErrors).toContain("excel_formula_error");
    expect(result.passed).toBe(false);
  });

  it("flags secret leak as major even with high base score", () => {
    const result = evaluateDeliverableQuality({
      deliverable: deliverable({
        content: "接続情報 api_key=sk-test_abc123",
        markdown: "接続情報 api_key=sk-test_abc123",
      }),
      assignment: "設定手順書",
      baseScore: 99,
    });
    expect(result.majorErrors).toContain("secret_leak");
    expect(result.passed).toBe(false);
  });

  it("merges revision brief into feedback when not passed", () => {
    const evaluation = evaluateDeliverableQuality({
      deliverable: deliverable({ content: "", markdown: "", plainText: "" }),
      assignment: "文書",
    });
    const merged = mergeQualityIntoDeterministicFeedback(
      evaluation,
      "deterministic notes",
    );
    expect(merged).toContain("deterministic notes");
    expect(merged).toContain("品質評価フィードバック");
  });
});
