import { describe, expect, it } from "vitest";

import {
  normalizeAutomation,
  normalizeAutomations,
  normalizeDashboardJob,
  normalizeDashboardJobs,
  normalizePresetType,
  normalizeProject,
  normalizeProjects,
  normalizeSchedulePreset,
} from "./index";

describe("compatibility guards", () => {
  it("normalizeProject fills missing fields with defaults", () => {
    const project = normalizeProject({
      title: "Test",
      workRequest: undefined,
      status: "unknown",
    });

    expect(project.workRequest).toBe("");
    expect(project.status).toBe("pending");
    expect(project.title).toBe("Test");
    expect(Array.isArray(project.assignedEmployees)).toBe(true);
  });

  it("normalizeProjects coerces non-array input to empty list", () => {
    expect(normalizeProjects(null)).toEqual([]);
    expect(normalizeProjects(undefined)).toEqual([]);
  });

  it("normalizeAutomation handles missing schedule preset and workflow assignment array", () => {
    const automation = normalizeAutomation({
      name: "SNS",
      workflow: { assignment: ["line one", "line two"] },
      schedule: {
        kind: "schedule",
        preset: null,
        label: "daily",
      },
    });

    expect(automation.workflow.assignment).toBe("line one\nline two");
    expect(automation.schedule.kind).toBe("schedule");
    if (automation.schedule.kind === "schedule") {
      expect(automation.schedule.preset).toEqual({
        type: "daily",
        hour: 9,
        minute: 0,
      });
    }
    expect(automation.status).toBe("idle");
  });

  it("normalizePresetType defaults unknown types to custom", () => {
    expect(normalizePresetType(undefined)).toBe("custom");
    expect(normalizePresetType("weekly")).toBe("weekly");
    expect(normalizePresetType("legacy")).toBe("custom");
  });

  it("normalizeSchedulePreset returns null for custom preset type", () => {
    expect(normalizeSchedulePreset({ type: "custom", hour: 10, minute: 30 })).toBeNull();
    expect(normalizeSchedulePreset(null)).toBeNull();
  });

  it("normalizeAutomations maps arrays safely", () => {
    const automations = normalizeAutomations([null, { name: "A" }]);
    expect(automations).toHaveLength(2);
    expect(automations[0]?.name).toBe("無題の自動化");
    expect(automations[1]?.name).toBe("A");
  });

  it("normalizeDashboardJob fills missing status and strings", () => {
    const job = normalizeDashboardJob({
      kind: "project",
      title: undefined,
      subtitle: undefined,
      status: "broken",
    });

    expect(job.title).toBe("無題の仕事");
    expect(job.subtitle).toBe("");
    expect(job.status).toBe("not_started");
    expect(job.icon).toBe("📋");
  });

  it("normalizeDashboardJobs returns empty array for invalid input", () => {
    expect(normalizeDashboardJobs(undefined)).toEqual([]);
    expect(normalizeDashboardJobs("nope")).toEqual([]);
  });
});
