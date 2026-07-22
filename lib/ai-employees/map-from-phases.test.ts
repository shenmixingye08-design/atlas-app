import { describe, expect, it } from "vitest";

import { ui } from "@/lib/i18n";
import { defaultVisibleAiEmployeeDepartments } from "@/lib/ai-employees/registry";
import { buildLoadingPhases, createInitialPhases } from "@/lib/workspace/constants";

import { mapWorkflowPhasesToAiEmployees } from "./map-from-phases";

function visibleIndex(id: string): number {
  return defaultVisibleAiEmployeeDepartments.findIndex((dept) => dept.id === id);
}

describe("mapWorkflowPhasesToAiEmployees", () => {
  it("starts with sales department running", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(0));

    expect(employees).toHaveLength(defaultVisibleAiEmployeeDepartments.length);
    expect(employees[visibleIndex("sales")]).toMatchObject({
      id: "sales",
      icon: "👔",
      name: ui.aiEmployees.departments.sales.name,
      task: ui.aiEmployees.departments.sales.tasks.running,
      status: "running",
    });
  });

  it("maps planner phases to materials department", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(2));

    expect(employees[visibleIndex("materials")]).toMatchObject({
      id: "materials",
      icon: "📊",
      name: ui.aiEmployees.departments.materials.name,
      task: ui.aiEmployees.departments.materials.tasks.running,
      status: "running",
    });
    expect(employees[visibleIndex("sales")]?.status).toBe("completed");
  });

  it("maps worker phases to materials department", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(4));

    expect(employees[visibleIndex("materials")]).toMatchObject({
      id: "materials",
      status: "running",
      task: ui.aiEmployees.departments.materials.tasks.running,
    });
  });

  it("maps reviewer and qa phases to quality department", () => {
    const reviewer = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(8));
    const qa = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(9));

    expect(reviewer[visibleIndex("quality")]).toMatchObject({
      id: "quality",
      icon: "🧐",
      name: ui.aiEmployees.departments.quality.name,
      task: ui.aiEmployees.departments.quality.tasks.running,
      status: "running",
    });
    expect(qa[visibleIndex("quality")]?.status).toBe("running");
  });

  it("maps final deliverable phase to delivery department", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(11));

    expect(employees[visibleIndex("delivery")]).toMatchObject({
      id: "delivery",
      icon: "📦",
      name: ui.aiEmployees.departments.delivery.name,
      task: ui.aiEmployees.departments.delivery.tasks.running,
      status: "running",
    });
  });

  it("marks all departments completed when work is done", () => {
    const employees = mapWorkflowPhasesToAiEmployees(createInitialPhases(), {
      isComplete: true,
    });

    expect(employees.every((employee) => employee.status === "completed")).toBe(
      true,
    );
    expect(employees[visibleIndex("delivery")]?.task).toBe(
      ui.aiEmployees.departments.delivery.tasks.completed,
    );
  });
});
