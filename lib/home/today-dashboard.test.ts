import { describe, expect, it } from "vitest";

import { SEED_AUTOMATIONS } from "@/lib/automations/domain";

import {
  deriveAutomationJobStatus,
  deriveProjectJobStatus,
  partitionProjectsForToday,
} from "./today-dashboard";

describe("today dashboard", () => {
  it("marks running automation as executing", () => {
    const automation = { ...SEED_AUTOMATIONS[0], status: "running" as const };
    expect(deriveAutomationJobStatus(automation, false)).toBe("running");
  });

  it("marks approve flow success as awaiting review", () => {
    const automation = {
      ...SEED_AUTOMATIONS[1],
      status: "success" as const,
      lastRun: new Date().toISOString(),
      executionLevel: "approve_then_run" as const,
    };
    expect(deriveAutomationJobStatus(automation, false)).toBe("awaiting_review");
  });

  it("partitions projects by status", () => {
    const now = new Date();
    const { inProgress, nextUp, completed } = partitionProjectsForToday(
      [
        {
          id: "1",
          title: "Running",
          workRequest: "test",
          status: "running",
          progress: 50,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          assignedEmployees: [],
          result: null,
        },
        {
          id: "2",
          title: "Pending",
          workRequest: "test",
          status: "pending",
          progress: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          assignedEmployees: [],
          result: null,
        },
      ],
      now,
    );

    expect(inProgress).toHaveLength(1);
    expect(nextUp).toHaveLength(1);
    expect(completed).toHaveLength(0);
    expect(deriveProjectJobStatus({ status: "running" } as never)).toBe("running");
    expect(deriveProjectJobStatus({ status: "review" } as never)).toBe(
      "awaiting_review",
    );
  });

  it("handles malformed project records without throwing", () => {
    const now = new Date();
    const result = partitionProjectsForToday(
      [
        {
          id: "broken",
          title: "Broken",
          workRequest: undefined,
          status: "running",
          progress: 50,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          assignedEmployees: [],
          result: null,
        } as never,
        null as never,
      ],
      now,
    );

    expect(result.inProgress).toHaveLength(1);
    expect(result.inProgress[0]?.subtitle).toBe("");
  });
});
