import { describe, expect, it } from "vitest";

import type { Project } from "@/lib/projects/types";

import { buildProjectTimeSaved } from "./time-saved-display";

describe("buildProjectTimeSaved", () => {
  it("returns null when duration was not measured", () => {
    const project = {
      id: "p1",
      title: "x",
      workRequest: "X投稿文を作って",
      status: "completed",
      progress: 100,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:01:00.000Z",
      assignedEmployees: [],
      result: {
        totalDurationMs: 0,
      },
    } as unknown as Project;

    expect(buildProjectTimeSaved(project)).toBeNull();
  });

  it("uses measured duration and typical baseline when available", () => {
    const project = {
      id: "p1",
      title: "SNS投稿",
      workRequest: "X投稿文を作って",
      status: "completed",
      progress: 100,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:01:00.000Z",
      assignedEmployees: [],
      result: {
        assignment: "X投稿文を作って",
        finalResponse: "done",
        totalDurationMs: 40_000,
        deliverable: {
          type: "social_post",
          title: "投稿文",
          summary: "hello",
          sections: [],
        },
      },
    } as unknown as Project;

    const breakdown = buildProjectTimeSaved(project);
    expect(breakdown?.measuredSec).toBe(40);
    expect(breakdown?.typicalManualMinutes).toBe(15);
    expect(breakdown?.savedMinutes).toBeGreaterThan(0);
  });
});
