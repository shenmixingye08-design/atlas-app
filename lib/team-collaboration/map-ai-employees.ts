import type { OrchestrationResult } from "@/lib/orchestration/types";
import type { AiEmployeeDisplayState } from "@/lib/ai-employees/types";
import { getAiEmployeeDepartment } from "@/lib/ai-employees/registry";

import { mapDepartmentToAiEmployee, getEmployeeDisplayMeta } from "./employee-map";
import { buildTeamCollaborationSnapshot } from "./build-snapshot";

export function mapExecutionsToAiEmployees(
  result: OrchestrationResult | null,
  options?: { isComplete?: boolean },
): AiEmployeeDisplayState[] {
  if (!result) return [];

  const snapshot = buildTeamCollaborationSnapshot(result);
  const isComplete = options?.isComplete ?? result.approved;

  const byDept = new Map<
    string,
    { status: AiEmployeeDisplayState["status"]; task: string; count: number }
  >();

  for (const stage of snapshot.stages) {
    if (!stage.employeeId || stage.id === "planner" || stage.id === "delivery") continue;

    const meta = getEmployeeDisplayMeta(stage.employeeId);
    const deptId = meta.aiDepartmentId;
    const existing = byDept.get(deptId);

    let status = stage.status;
    if (isComplete && status !== "error") status = "completed";

    const taskLabel =
      status === "running"
        ? stage.title
        : status === "completed"
          ? getAiEmployeeDepartment(deptId).tasks.completed
          : getAiEmployeeDepartment(deptId).tasks.waiting;

    if (!existing) {
      byDept.set(deptId, { status, task: taskLabel, count: 1 });
    } else {
      const mergedStatus =
        status === "error" || existing.status === "error"
          ? "error"
          : status === "running" || existing.status === "running"
            ? "running"
            : status === "completed" && existing.status === "completed"
              ? "completed"
              : existing.status;
      byDept.set(deptId, {
        status: mergedStatus,
        task: mergedStatus === "running" ? stage.title : existing.task,
        count: existing.count + 1,
      });
    }
  }

  const visibleDepts = ["secretary", "materials", "sns", "sales", "quality", "delivery"] as const;

  return visibleDepts.map((deptId) => {
    const dept = getAiEmployeeDepartment(deptId);
    const state = byDept.get(deptId);
    const status = state?.status ?? (isComplete ? "completed" : "waiting");

    return {
      id: deptId,
      icon: dept.icon,
      name: dept.name,
      task: state?.task ?? dept.tasks[status === "running" ? "running" : status === "completed" ? "completed" : "waiting"],
      status,
    };
  });
}
