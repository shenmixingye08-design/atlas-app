import { describe, expect, it } from "vitest";

import { createProjectService } from "./project-service";
import type { ProjectRepository } from "./repositories/types";
import type { Project } from "./types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";

function createMemoryRepository(): ProjectRepository {
  let store: Project[] = [];
  return {
    list: () => store,
    save: (projects) => {
      store = projects;
    },
  };
}

function fakeResult(): OrchestrationResult {
  return {
    assignment: "テスト依頼",
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: emptyDeliverable("document"),
    reviewComments: "",
    approved: true,
    finalResponse: "完了しました",
    totalDurationMs: 10,
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
  };
}

describe("ProjectService.saveFromOrchestration deterministic id", () => {
  it("reuses a provided stable id so a re-save dedupes instead of duplicating", () => {
    const service = createProjectService({ repository: createMemoryRepository() });
    const id = "commander-run_abc";

    const first = service.saveFromOrchestration("テスト依頼", fakeResult(), id);
    expect(first.id).toBe(id);
    expect(service.list()).toHaveLength(1);

    // Second save with the same id (server persist + client save of one run)
    // must not create a duplicate history entry.
    const second = service.saveFromOrchestration("テスト依頼", fakeResult(), id);
    expect(second.id).toBe(id);
    expect(service.list()).toHaveLength(1);
    expect(service.getById(id)?.id).toBe(id);
  });

  it("generates a random id when none is provided (unchanged legacy behavior)", () => {
    const service = createProjectService({ repository: createMemoryRepository() });
    const project = service.saveFromOrchestration("テスト依頼", fakeResult());
    expect(project.id).toBeTruthy();
    expect(service.list()).toHaveLength(1);
  });
});
