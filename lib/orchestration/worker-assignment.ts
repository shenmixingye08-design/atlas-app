import type { DepartmentId } from "@/lib/employees/types";
import type { EmployeeId } from "@/lib/employees/types";
import { inferDepartmentFromTask } from "@/lib/departments/task-routing";
import {
  getEmployeeByWorkflowAgent,
  getEmployeesByDepartment,
} from "@/lib/employees/registry";

import type { WorkTask } from "./types";

/**
 * Legacy development-only pool for round-robin fallback.
 * Preserves prior behavior when task routing cannot infer a department.
 */
export const WORKER_POOL_DEPARTMENTS: readonly DepartmentId[] = [
  "development",
] as const;

export type WorkerAssignment = {
  taskId: number;
  employeeId: EmployeeId;
  department: DepartmentId;
};

type WorkerPoolEntry = {
  employeeId: EmployeeId;
  department: DepartmentId;
};

function buildLegacyWorkerPool(): WorkerPoolEntry[] {
  return WORKER_POOL_DEPARTMENTS.flatMap((department) =>
    getEmployeesByDepartment(department).map((employee) => ({
      employeeId: employee.id,
      department,
    })),
  );
}

function defaultWorkerAssignment(): WorkerPoolEntry {
  const fallback = getEmployeeByWorkflowAgent("worker");

  return {
    employeeId: fallback?.id ?? "development-senior-dev",
    department: fallback?.department ?? "development",
  };
}

function assignFromDepartment(
  departmentId: DepartmentId,
  pickIndex: number,
  exclude: ReadonlySet<EmployeeId>,
): WorkerPoolEntry | null {
  const employees = getEmployeesByDepartment(departmentId).filter(
    (e) => !exclude.has(e.id),
  );
  if (employees.length === 0) return null;

  const employee = employees[pickIndex % employees.length]!;
  return { employeeId: employee.id, department: departmentId };
}

/**
 * Assigns one employee per task for parallel worker execution.
 *
 * When a Planner task names or implies a department, routes to that department's
 * employee pool. Otherwise falls back to the legacy Development round-robin pool.
 */
export function assignWorkersToTasks(
  tasks: WorkTask[],
  options?: { excludeEmployeeIds?: readonly EmployeeId[] },
): WorkerAssignment[] {
  const exclude = new Set(options?.excludeEmployeeIds ?? []);
  const legacyPool = buildLegacyWorkerPool();
  const fallback = defaultWorkerAssignment();
  const departmentPickCounts = new Map<DepartmentId, number>();

  return tasks.map((task, index) => {
    const inferredDepartment = inferDepartmentFromTask(task);

    if (inferredDepartment) {
      const pickIndex = departmentPickCounts.get(inferredDepartment) ?? 0;
      departmentPickCounts.set(inferredDepartment, pickIndex + 1);

      const routed = assignFromDepartment(inferredDepartment, pickIndex, exclude);
      if (routed) {
        return {
          taskId: task.id,
          employeeId: routed.employeeId,
          department: routed.department,
        };
      }
    }

    const entry =
      legacyPool.filter((item) => !exclude.has(item.employeeId))[index % legacyPool.length] ??
      fallback;

    return {
      taskId: task.id,
      employeeId: entry.employeeId,
      department: entry.department,
    };
  });
}
