import type { AgentId } from "@/lib/agents/types";
import { getAgentById, isAgentId } from "@/lib/agents/registry";
import { getDepartmentDefinition } from "@/lib/departments/registry";

import { allDepartmentEmployees } from "./employees";
import type {
  Department,
  DepartmentId,
  Employee,
  EmployeeId,
  EmployeeRegistry,
} from "./types";

/** Primary employees that drive the default multi-agent workflow pipeline. */
export const DEFAULT_WORKFLOW_EMPLOYEE_IDS = [
  "ceo-office-atlas-ceo",
  "planning-lead-planner",
  "development-senior-dev",
  "qa-quality-lead",
] as const satisfies readonly EmployeeId[];

export type WorkflowEmployeeId = (typeof DEFAULT_WORKFLOW_EMPLOYEE_IDS)[number];

const EMPLOYEE_COLOR_CLASSES: Record<string, string> = {
  violet: "bg-violet-500/20 text-violet-300 ring-violet-500/30",
  sky: "bg-sky-500/20 text-sky-300 ring-sky-500/30",
  blue: "bg-blue-500/20 text-blue-300 ring-blue-500/30",
  green: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30",
  emerald: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30",
  cyan: "bg-cyan-500/20 text-cyan-300 ring-cyan-500/30",
  fuchsia: "bg-fuchsia-500/20 text-fuchsia-300 ring-fuchsia-500/30",
  orange: "bg-orange-500/20 text-orange-300 ring-orange-500/30",
  rose: "bg-rose-500/20 text-rose-300 ring-rose-500/30",
  slate: "bg-slate-500/20 text-slate-300 ring-slate-500/30",
  amber: "bg-amber-500/20 text-amber-300 ring-amber-500/30",
  teal: "bg-teal-500/20 text-teal-300 ring-teal-500/30",
};

const LEGACY_AGENT_COLOR_CLASSES: Record<AgentId, string> = {
  ceo: "bg-violet-500/20 text-violet-300 ring-violet-500/30",
  planner: "bg-sky-500/20 text-sky-300 ring-sky-500/30",
  worker: "bg-blue-500/20 text-blue-300 ring-blue-500/30",
  reviewer: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30",
};

const FALLBACK_COLOR_CLASS =
  "bg-zinc-500/20 text-zinc-300 ring-zinc-500/30";

export type ResolvedAssignee = {
  id: string;
  name: string;
  description: string;
  colorClass: string;
  isLegacyAgentId: boolean;
};

function colorClassForEmployee(employee: Employee): string {
  return EMPLOYEE_COLOR_CLASSES[employee.color] ?? FALLBACK_COLOR_CLASS;
}

/** Resolve a project assignee ID to display metadata with legacy agent-ID support. */
export function resolveAssignedEmployee(id: string): ResolvedAssignee {
  const direct = findEmployeeById(id);
  if (direct) {
    return {
      id: direct.id,
      name: direct.name,
      description: direct.role,
      colorClass: colorClassForEmployee(direct),
      isLegacyAgentId: false,
    };
  }

  if (isAgentId(id)) {
    const linked = getEmployeeByWorkflowAgent(id);
    if (linked) {
      return {
        id: linked.id,
        name: linked.name,
        description: linked.role,
        colorClass: colorClassForEmployee(linked),
        isLegacyAgentId: true,
      };
    }

    const agent = getAgentById(id);
    return {
      id,
      name: agent.name.replace(" Agent", ""),
      description: agent.description,
      colorClass: LEGACY_AGENT_COLOR_CLASSES[id],
      isLegacyAgentId: true,
    };
  }

  return {
    id,
    name: id,
    description: "不明なメンバー",
    colorClass: FALLBACK_COLOR_CLASS,
    isLegacyAgentId: false,
  };
}

function buildRegistry(employees: readonly Employee[]): EmployeeRegistry {
  return Object.fromEntries(employees.map((e) => [e.id, e]));
}

/** Mutable employee list — supports runtime registration. */
const employeeList: Employee[] = [...allDepartmentEmployees];

/** Master employee registry — keyed by employee ID. */
export const employeeRegistry: EmployeeRegistry = buildRegistry(employeeList);

/** Ordered list of all registered employees. */
export function getAllEmployees(): readonly Employee[] {
  return employeeList;
}

/** @deprecated Use getAllEmployees() for dynamic lists. Initial snapshot. */
export const allEmployees: readonly Employee[] = employeeList;

/** Workflow agent ID → primary employee mapping. Rebuilt on registration. */
let workflowEmployeeMap: Readonly<Partial<Record<AgentId, Employee>>> =
  buildWorkflowMap(employeeList);

function buildWorkflowMap(
  employees: readonly Employee[],
): Readonly<Partial<Record<AgentId, Employee>>> {
  return Object.fromEntries(
    employees
      .filter((e) => e.workflowAgentId !== undefined)
      .map((e) => [e.workflowAgentId!, e]),
  );
}

/** Look up an employee by unique ID. */
export function getEmployeeById(id: EmployeeId): Employee {
  const employee = employeeRegistry[id];
  if (!employee) {
    throw new Error(`Employee not found: ${id}`);
  }
  return employee;
}

/** Safe lookup — returns undefined if not found. */
export function findEmployeeById(id: string): Employee | undefined {
  return employeeRegistry[id as EmployeeId];
}

/** Check whether a string is a registered employee ID. */
export function isEmployeeId(value: string): value is EmployeeId {
  return value in employeeRegistry;
}

/** Get a department definition by ID. */
export function getDepartmentById(id: DepartmentId): Department {
  return getDepartmentDefinition(id);
}

/** Get all employees in a department (includes dynamically registered). */
export function getEmployeesByDepartment(
  departmentId: DepartmentId,
): readonly Employee[] {
  return employeeList.filter((e) => e.department === departmentId);
}

/** Get the primary employee linked to a workflow agent (ceo, planner, worker, reviewer). */
export function getEmployeeByWorkflowAgent(
  agentId: AgentId,
): Employee | undefined {
  return workflowEmployeeMap[agentId];
}

/** Get the system prompt for a workflow agent from the employee layer. */
export function getWorkflowAgentPrompt(agentId: AgentId): string {
  const employee = getEmployeeByWorkflowAgent(agentId);
  if (!employee) {
    throw new Error(`No employee linked to workflow agent: ${agentId}`);
  }
  return employee.systemPrompt;
}

/**
 * Register an additional employee at runtime.
 * Supports unlimited scaling — new employees merge into the registry.
 */
export function registerEmployee(employee: Employee): void {
  (employeeRegistry as Record<string, Employee>)[employee.id] = employee;
  employeeList.push(employee);
  workflowEmployeeMap = buildWorkflowMap(employeeList);
}
