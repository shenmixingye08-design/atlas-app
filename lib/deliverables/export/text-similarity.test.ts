import { describe, expect, it } from "vitest"

import {
  contentMatchRate,
  normalizeDeliverableText,
  orderedCharRecall,
} from "./text-similarity"

describe("text-similarity", () => {
  it("normalizes markdown noise", () => {
    const n = normalizeDeliverableText("# 見出し\n- 項目A\n| a | b |\n| --- | --- |\n")
    expect(n).toContain("見出し")
    expect(n).toContain("項目A")
    expect(n).not.toContain("---")
  })

  it("reports high recall for near-identical Japanese text", () => {
    const a = "今はやりのシングル向け選出。MINERVOTが東京都で提案します。"
    const b = "今はやりのシングル向け選出 MINERVOTが東京都で提案します"
    expect(orderedCharRecall(a, b)).toBeGreaterThanOrEqual(0.95)
    expect(contentMatchRate(a, b)).toBeGreaterThanOrEqual(0.95)
  })

  it("reports low recall when body is missing", () => {
    expect(orderedCharRecall("あいうえおかきくけこ", "xyz")).toBeLessThan(0.2)
  })
})
