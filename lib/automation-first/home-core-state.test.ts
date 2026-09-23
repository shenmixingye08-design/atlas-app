import { describe, expect, it } from "vitest";

import { deriveHomeCoreState } from "./home-core-state";

const base = {
  checking: false,
  attentionCount: 0,
  runningCount: 0,
  nextRun: null,
  entrustedCount: 0,
};

describe("deriveHomeCoreState", () => {
  it("shows checking while ops data is unknown", () => {
    expect(deriveHomeCoreState({ ...base, checking: true, attentionCount: 3 }).kind).toBe(
      "checking",
    );
  });

  it("prioritises attention over running work", () => {
    const state = deriveHomeCoreState({ ...base, attentionCount: 2, runningCount: 1 });
    expect(state.kind).toBe("attention");
    expect(state.label).toContain("2件");
    expect(state.href).toBe("#af-attention-heading");
  });

  it("reports running work with the real count and title", () => {
    const state = deriveHomeCoreState({
      ...base,
      runningCount: 3,
      runningTitle: "朝のX投稿",
    });
    expect(state.kind).toBe("running");
    expect(state.label).toContain("3件");
    expect(state.detail).toContain("朝のX投稿");
  });

  it("describes the next scheduled run", () => {
    const state = deriveHomeCoreState({
      ...base,
      nextRun: { name: "週次レポート", whenLabel: "9/24 08:00" },
    });
    expect(state.kind).toBe("scheduled");
    expect(state.detail).toBe("9/24 08:00 に「週次レポート」");
  });

  it("falls back to idle without inventing activity", () => {
    expect(deriveHomeCoreState({ ...base, entrustedCount: 2 }).label).toContain("2件");
    const empty = deriveHomeCoreState(base);
    expect(empty.kind).toBe("idle");
    expect(empty.label).not.toMatch(/\d/);
  });
});
