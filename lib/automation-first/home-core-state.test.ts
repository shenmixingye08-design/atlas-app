import { describe, expect, it } from "vitest";

import type { AutomationRun } from "@/lib/automation-platform/types";

import {
  activeRunIds,
  deriveHomeCoreState,
  findNewlyCompletedRun,
} from "./home-core-state";

function run(id: string, status: AutomationRun["status"], artifacts: AutomationRun["artifacts"] = []) {
  return { id, status, automationName: `job ${id}`, artifacts } as unknown as AutomationRun;
}

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

describe("live completion detection", () => {
  const artifact = {
    id: "a1",
    kind: "deliverable" as const,
    label: "週次レポート.xlsx",
    url: null,
    externalId: null,
    createdAt: "2026-09-23T00:00:00.000Z",
  };

  it("tracks only active runs", () => {
    expect([...activeRunIds([run("1", "running"), run("2", "succeeded"), run("3", "queued")])]).toEqual([
      "1",
      "3",
    ]);
  });

  it("detects a previously active run that succeeded", () => {
    const done = findNewlyCompletedRun(new Set(["1"]), [run("1", "succeeded", [artifact])]);
    expect(done).toEqual({
      runId: "1",
      title: "job 1",
      artifactLabel: "週次レポート.xlsx",
      href: "/automations/runs/1#artifact-a1",
    });
    expect(deriveHomeCoreState({ ...base, attentionCount: 1, justCompleted: done }).kind).toBe(
      "completed",
    );
  });

  it("never celebrates partial success, failure or unseen runs", () => {
    expect(findNewlyCompletedRun(new Set(["1"]), [run("1", "partially_succeeded")])).toBeNull();
    expect(findNewlyCompletedRun(new Set(["1"]), [run("1", "failed")])).toBeNull();
    expect(findNewlyCompletedRun(new Set(), [run("1", "succeeded")])).toBeNull();
    expect(findNewlyCompletedRun(new Set(["2"]), [run("1", "succeeded")])).toBeNull();
  });
});
