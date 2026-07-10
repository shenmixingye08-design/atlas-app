import type { DepartmentId } from "@/lib/employees/types";

import {
  allDepartmentDefinitions,
  workerDepartmentDefinitions,
} from "./definitions";
import type {
  DepartmentDefinition,
  DepartmentRegistry,
  WorkerEligibleDepartmentId,
} from "./types";
import { WORKER_ELIGIBLE_DEPARTMENT_IDS, isWorkerEligibleDepartment } from "./types";

function buildDepartmentRegistry(
  definitions: readonly DepartmentDefinition[],
): DepartmentRegistry {
  return definitions.reduce<Record<DepartmentId, DepartmentDefinition>>(
    (registry, department) => {
      registry[department.id] = department;
      return registry;
    },
    {} as Record<DepartmentId, DepartmentDefinition>,
  );
}

export const departmentRegistry: DepartmentRegistry =
  buildDepartmentRegistry(allDepartmentDefinitions);

export const allDepartments: readonly DepartmentDefinition[] =
  allDepartmentDefinitions;

export const workerDepartments: readonly DepartmentDefinition[] =
  workerDepartmentDefinitions;

export function getDepartmentDefinition(
  id: DepartmentId,
): DepartmentDefinition {
  const department = departmentRegistry[id];
  if (!department) {
    throw new Error(`Department not found: ${id}`);
  }
  return department;
}

export function findDepartmentDefinition(
  id: string,
): DepartmentDefinition | undefined {
  return departmentRegistry[id as DepartmentId];
}

export function getWorkerDepartmentDefinitions(): readonly DepartmentDefinition[] {
  return workerDepartments;
}

export function getDepartmentPrompt(id: DepartmentId): string {
  return getDepartmentDefinition(id).systemPrompt;
}

export function getDepartmentEmployeesRegistryHint(id: DepartmentId): string {
  return `lib/employees/employees/${id}.ts`;
}

export {
  WORKER_ELIGIBLE_DEPARTMENT_IDS,
  isWorkerEligibleDepartment,
};

export type {
  DepartmentDefinition,
  DepartmentRegistry,
  WorkerEligibleDepartmentId,
  WorkerDepartmentId,
  OrchestrationDepartmentId,
} from "./types";
