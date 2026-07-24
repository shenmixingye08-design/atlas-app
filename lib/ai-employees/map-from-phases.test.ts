import { describe, expect, it } from "vitest";

import { buildLoadingPhases, createInitialPhases } from "@/lib/workspace/constants";

import { mapWorkflowPhasesToAiEmployees } from "./map-from-phases";

describe("mapWorkflowPhasesToAiEmployees", () => {
  function byId(
    employees: ReturnType<typeof mapWorkflowPhasesToAiEmployees>,
    id: string,
  ) {
    return employees.find((employee) => employee.id === id);
  }

  it("starts with sales department running", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(0));

    expect(employees.map((employee) => employee.id)).toEqual([
      "sales",
      "secretary",
      "sns",
      "materials",
      "quality",
      "delivery",
    ]);
    expect(byId(employees, "sales")).toMatchObject({
      id: "sales",
      icon: "👔",
      name: "営業部",
      task: "依頼内容を分析中",
      status: "running",
    });
    expect(byId(employees, "secretary")?.status).toBe("waiting");
  });

  it("maps planner phases to materials department", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(2));

    expect(byId(employees, "materials")).toMatchObject({
      id: "materials",
      icon: "📊",
      name: "資料作成部",
      task: "資料作成中",
      status: "running",
    });
    expect(byId(employees, "sales")?.status).toBe("completed");
    expect(byId(employees, "secretary")?.status).toBe("completed");
    expect(byId(employees, "sns")?.status).toBe("completed");
  });

  it("maps worker phases to materials department", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(4));

    expect(byId(employees, "materials")).toMatchObject({
      id: "materials",
      status: "running",
      task: "資料作成中",
    });
  });

  it("maps reviewer and qa phases to quality department", () => {
    const reviewer = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(8));
    const qa = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(9));

    expect(byId(reviewer, "quality")).toMatchObject({
      id: "quality",
      icon: "🧐",
      name: "品質管理部",
      task: "内容確認中",
      status: "running",
    });
    expect(byId(qa, "quality")?.status).toBe("running");
  });

  it("maps final deliverable phase to delivery department", () => {
    const employees = mapWorkflowPhasesToAiEmployees(buildLoadingPhases(11));

    expect(byId(employees, "delivery")).toMatchObject({
      id: "delivery",
      icon: "📦",
      name: "納品部",
      task: "成果物準備中",
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
    expect(byId(employees, "delivery")?.task).toBe("成果物準備完了");
  });
});
