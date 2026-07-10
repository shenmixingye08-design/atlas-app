import { describe, expect, it } from "vitest";

import { computeMonthlyAchievements } from "./monthly-achievements";

describe("monthly achievements", () => {
  it("counts completed work by category for the current month", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    const stats = computeMonthlyAchievements(
      [
        {
          id: "1",
          title: "SNS投稿",
          workRequest: "X投稿文",
          status: "completed",
          progress: 100,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          assignedEmployees: [],
          result: null,
        },
        {
          id: "2",
          title: "ブログ",
          workRequest: "記事作成",
          status: "completed",
          progress: 100,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          assignedEmployees: [],
          result: null,
        },
      ],
      [],
      now,
    );

    expect(stats.snsPosts).toBe(1);
    expect(stats.blogPosts).toBe(1);
    expect(stats.hoursSaved).toBeGreaterThan(0);
  });

  it("handles missing workflow fields on automations", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    const stats = computeMonthlyAchievements(
      [],
      [
        {
          id: "auto-1",
          name: "SNS投稿",
          status: "success",
          lastRun: now.toISOString(),
          workflow: undefined,
        } as never,
      ],
      now,
    );

    expect(stats.snsPosts).toBe(1);
  });
});
