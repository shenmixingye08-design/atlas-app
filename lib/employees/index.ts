/**
 * Atlas Employee Organization — public exports.
 *
 * Safe for client and server import.
 * Workflow orchestration continues to use lib/agents — this layer provides
 * the company structure (departments, employees, prompts).
 */

export type {
  Department,
  DepartmentId,
  DepartmentRegistry,
  Employee,
  EmployeeId,
  EmployeeRegistry,
} from "./types";

export { defineDepartment, defineEmployee } from "./define";

export {
  DEPARTMENTS,
  allDepartments,
  departmentRegistry,
} from "./departments";

export {
  employeeRegistry,
  allEmployees,
  getAllEmployees,
  getEmployeeById,
  findEmployeeById,
  isEmployeeId,
  getDepartmentById,
  getEmployeesByDepartment,
  getEmployeeByWorkflowAgent,
  getWorkflowAgentPrompt,
  registerEmployee,
  DEFAULT_WORKFLOW_EMPLOYEE_IDS,
  resolveAssignedEmployee,
} from "./registry";

export type { WorkflowEmployeeId, ResolvedAssignee } from "./registry";

export * from "./employees";

export {
  inferDepartmentFromTask,
  getDepartmentDefinition,
  getDepartmentPrompt,
  WORKER_ELIGIBLE_DEPARTMENT_IDS,
  workerDepartments,
} from "@/lib/departments";
export type { DepartmentDefinition, WorkerEligibleDepartmentId } from "@/lib/departments";
