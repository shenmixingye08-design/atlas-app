import { describe, expect, it } from "vitest";

import { buildLoadingPhases, createInitialPhases } from "@/lib/workspace/constants";

import { mapWorkflowPhasesToAiEmployees } from "./map-from-phases";

/**
 * Phase1 loading phases are secretary ids (understand/write/polish).
 * They map to the materials department; AI-employee theater is not user-facing.
 */
describe("mapWorkflowPhasesToAiEmployees", () => {
  function byId(
    employees: ReturnType<typeof mapWorkflowPhasesToAiEmployees>,
    id: string,
  ) {
    return employees.find((employee) => employee.id === id);
  }

  it("keeps department order stable", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(0));
    expect(employees.map((employee) => employee.id)).toEqual([
      "sales",
      "secretary",
      "sns",
      "materials",
      "quality",
      "delivery",
    ]);
  });

  it("maps secretary understand phase to materials running", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(0));
    expect(byId(employees, "materials")).toMatchObject({
      id: "materials",
      status: "running",
      task: "資料作成中",
    });
  });

  it("maps secretary polish phase to materials running", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(2));
    expect(byId(employees, "materials")?.status).toBe("running");
  });

  it("marks all departments completed when work is done", () => {
    const employees = mapWorkflowPhasesToAiEmployees(createInitialPhases(), {
      isComplete: true,
    });

    expect(employees.every((employee) => employee.status === "completed")).toBe(
      true,
    );
    expect(byId(employees, "delivery")?.task).toBe("成果物準備完了");
  });
});
