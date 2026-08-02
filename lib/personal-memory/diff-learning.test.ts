import { describe, expect, it } from "vitest";

import { analyzeDeliverableDiff } from "@/lib/personal-memory/diff-learning";

describe("analyzeDeliverableDiff", () => {
  it("detects shorten + bullets + emoji removal + conclusion first", () => {
    const before =
      "本日は長々と説明します。絵文字も付けます😊。本文がとても長いです。";
    const after =
      "結論: 対応します。\n- 要点A\n- 要点B\n- 要点C";
    const signals = analyzeDeliverableDiff({ before, after });
    const keys = signals.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["length", "structure", "emoji"]));
  });

  it("returns empty when unchanged", () => {
    expect(
      analyzeDeliverableDiff({ before: "同じ", after: "同じ" }),
    ).toEqual([]);
  });
});
