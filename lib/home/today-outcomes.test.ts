import { describe, expect, it } from "vitest";

import { SEED_AUTOMATIONS } from "@/lib/automations/domain";
import type { Project } from "@/lib/projects/types";

import { computeTodayOutcomes } from "./today-outcomes";

function project(partial: Partial<Project>): Project {
  return {
    id: partial.id ?? "p1",
    title: partial.title ?? "仕事",
    workRequest: partial.workRequest ?? "テスト",
    status: partial.status ?? "completed",
    progress: partial.progress ?? 100,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
    assignedEmployees: partial.assignedEmployees ?? [],
    result: partial.result ?? null,
    error: partial.error,
  };
}

describe("computeTodayOutcomes", () => {
  it("includes AI稼働中 count and today's completed metrics", () => {
    const stats = computeTodayOutcomes(
      [
        project({ id: "r1", status: "running", workRequest: "調査中" }),
        project({
          id: "c1",
          status: "completed",
          workRequest: "X投稿を作成",
          title: "X投稿",
        }),
      ],
      [
        {
          ...SEED_AUTOMATIONS[0],
          status: "running",
          lastRun: null,
        },
        {
          ...SEED_AUTOMATIONS[0],
          id: "done-sns",
          status: "success",
          lastRun: new Date().toISOString(),
          name: "X投稿",
          workflow: {
            ...SEED_AUTOMATIONS[0].workflow,
            assignment: "毎日Xへ投稿する",
          },
        },
      ],
    );

    expect(stats.aiRunning).toBe(2);
    expect(stats.completedTasks).toBeGreaterThanOrEqual(1);
    expect(stats.snsPosts).toBeGreaterThanOrEqual(1);
  });
});
