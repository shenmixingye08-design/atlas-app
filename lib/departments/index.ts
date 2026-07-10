/**
 * ATLAS Department System — public exports.
 *
 * Canonical department definitions, prompts, routing metadata, and registries.
 * Employee records remain in `lib/employees`; this module owns department structure.
 */

export { defineDepartmentDefinition } from "./define";

export {
  departmentRegistry,
  allDepartments,
  workerDepartments,
  getDepartmentDefinition,
  findDepartmentDefinition,
  getWorkerDepartmentDefinitions,
  getDepartmentPrompt,
  getDepartmentEmployeesRegistryHint,
  WORKER_ELIGIBLE_DEPARTMENT_IDS,
  isWorkerEligibleDepartment,
} from "./registry";

export type {
  DepartmentDefinition,
  DepartmentRegistry,
  WorkerEligibleDepartmentId,
  WorkerDepartmentId,
  OrchestrationDepartmentId,
} from "./registry";

export {
  inferDepartmentFromTask,
  stripDepartmentTagFromTitle,
} from "./task-routing";

export * from "./definitions";
