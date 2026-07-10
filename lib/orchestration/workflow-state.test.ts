import { describe, expect, it } from "vitest";

import {
  WorkflowState,
  WorkflowStateManager,
  canTransitionWorkflow,
  hydrateWorkflowState,
  inferWorkflowStateFromResult,
  legacyOrchestrationStatus,
} from "@/lib/orchestration/workflow-state";

describe("WorkflowStateManager", () => {
  it("starts in Pending with exactly one state", () => {
    const manager = new WorkflowStateManager("wf-1");
    expect(manager.getState()).toBe(WorkflowState.Pending);
  });

  it("rejects illegal transitions", () => {
    const manager = new WorkflowStateManager("wf-2");
    expect(() => manager.transition(WorkflowState.Completed)).toThrow(
      /Illegal workflow transition/,
    );
  });

  it("requires DeliverableReady before Completed", () => {
    const manager = new WorkflowStateManager("wf-3");
    manager.transition(WorkflowState.Planning);
    manager.transition(WorkflowState.Generating);
    manager.transition(WorkflowState.Reviewing);
    manager.transition(WorkflowState.QA);
    manager.transition(WorkflowState.Approved);
    expect(() => manager.transition(WorkflowState.Completed)).toThrow(
      /Illegal workflow transition/,
    );
  });

  it("allows revision loop QA → Generating → Reviewing → QA", () => {
    const manager = new WorkflowStateManager("wf-4");
    manager.transition(WorkflowState.Planning);
    manager.transition(WorkflowState.Generating);
    manager.transition(WorkflowState.Reviewing);
    manager.transition(WorkflowState.QA);
    manager.transition(WorkflowState.Generating, "worker revision");
    manager.transition(WorkflowState.Reviewing);
    manager.transition(WorkflowState.QA);
    expect(manager.getState()).toBe(WorkflowState.QA);
  });

  it("finalize enforces deliverable ready then completed", () => {
    const manager = new WorkflowStateManager("wf-5");
    manager.transition(WorkflowState.Planning);
    manager.transition(WorkflowState.Generating);
    manager.transition(WorkflowState.Reviewing);
    manager.transition(WorkflowState.QA);
    manager.finalize({ hasDeliverable: true, approved: true });
    expect(manager.getState()).toBe(WorkflowState.Completed);
    expect(legacyOrchestrationStatus(manager.getState())).toBe("completed");
  });

  it("finalize without deliverable moves to Failed", () => {
    const manager = new WorkflowStateManager("wf-6");
    manager.transition(WorkflowState.Planning);
    manager.finalize({ hasDeliverable: false, approved: false });
    expect(manager.getState()).toBe(WorkflowState.Failed);
  });

  it("fail marks timed out failures", () => {
    const manager = new WorkflowStateManager("wf-7");
    manager.transition(WorkflowState.Planning);
    manager.transition(WorkflowState.Generating);
    manager.fail("worker timed out", { timedOut: true });
    expect(manager.getSnapshot().timedOut).toBe(true);
    expect(manager.getState()).toBe(WorkflowState.Failed);
  });

  it("resumes from persisted record", () => {
    const record = {
      workflowId: "wf-8",
      state: WorkflowState.QA,
      transitions: [],
      updatedAt: new Date().toISOString(),
    };
    const manager = WorkflowStateManager.resume(record);
    expect(manager.getState()).toBe(WorkflowState.QA);
  });
});

describe("workflow state inference", () => {
  it("hydrates legacy completed results", () => {
    const record = hydrateWorkflowState({
      status: "completed",
      approved: true,
      ceo: {},
      plannerPlan: {},
      executions: [{}],
      deliverable: { markdown: "body" },
    });
    expect(record.state).toBe(WorkflowState.Completed);
  });

  it("infers failed from legacy status", () => {
    expect(inferWorkflowStateFromResult({ status: "failed" })).toBe(
      WorkflowState.Failed,
    );
  });
});

describe("transition matrix", () => {
  it("never allows direct Pending → Completed", () => {
    expect(canTransitionWorkflow(WorkflowState.Pending, WorkflowState.Completed)).toBe(
      false,
    );
  });
});
