import { describe, expect, it } from "vitest";

import {
  filterCompletedDeliverableProjects,
  isDeliverableCompleted,
} from "./completed-filter";
import type { Project } from "@/lib/projects/types";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    title: "Test",
    workRequest: "req",
    status: "completed",
    progress: 100,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T01:00:00.000Z",
    assignedEmployees: [],
    result: { status: "completed" } as never,
    ...overrides,
  };
}

describe("deliverable completed filter", () => {
  it("requires completed status and result for project rows", () => {
    expect(isDeliverableCompleted({ status: "running", result: {} })).toBe(false);
    expect(isDeliverableCompleted({ status: "completed", result: null })).toBe(
      false,
    );
    expect(isDeliverableCompleted({ status: "completed", result: {} })).toBe(
      true,
    );
  });

  it("rejects placeholder deliverables", () => {
    expect(
      isDeliverableCompleted({
        deliverable: {
          isPlaceholder: true,
          sizeBytes: 100,
          downloadUrl: "/api/x",
          fileName: "a.pdf",
        },
      }),
    ).toBe(false);
  });

  it("rejects zero-byte deliverables", () => {
    expect(
      isDeliverableCompleted({
        deliverable: {
          isPlaceholder: false,
          sizeBytes: 0,
          downloadUrl: "/api/x",
          fileName: "a.pdf",
        },
      }),
    ).toBe(false);
  });

  it("filters project list", () => {
    const items = filterCompletedDeliverableProjects([
      project({ id: "a", status: "running", result: null }),
      project({ id: "b" }),
    ]);
    expect(items.map((p) => p.id)).toEqual(["b"]);
  });
});
