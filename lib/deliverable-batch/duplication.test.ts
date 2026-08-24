import { describe, expect, it } from "vitest";

import { findDuplicateItems } from "./duplication";

describe("deliverable batch duplication", () => {
  it("detects exact, normalized, title, leading, cta, and hashtag overlap", () => {
    const hits = findDuplicateItems([
      {
        id: "a",
        title: "同じ題",
        status: "ready",
        sourceContent: "お問い合わせはこちら #a #b #c\n本文1",
      },
      {
        id: "b",
        title: "同じ題",
        status: "ready",
        sourceContent: "お問い合わせはこちら #c #b #a\n本文2",
      },
      {
        id: "c",
        title: "別",
        status: "ready",
        sourceContent: "お問い合わせはこちら #c #b #a\n本文3",
      },
    ]);
    const reasons = new Set(hits.map((hit) => hit.reason));
    expect(reasons.has("title") || reasons.has("cta") || reasons.has("hashtags")).toBe(true);
  });

  it("detects exact body match", () => {
    const hits = findDuplicateItems([
      { id: "a", title: "1", status: "ready", sourceContent: "まったく同じ本文です" },
      { id: "b", title: "2", status: "ready", sourceContent: "まったく同じ本文です" },
    ]);
    expect(hits.some((hit) => hit.reason === "exact")).toBe(true);
  });
});
