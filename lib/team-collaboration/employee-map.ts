import type { DepartmentId, EmployeeId } from "@/lib/employees/types";
import {
  findEmployeeById,
  getEmployeesByDepartment,
  resolveAssignedEmployee,
} from "@/lib/employees/registry";
import type { AiEmployeeDepartmentId } from "@/lib/ai-employees/types";
import { getAiEmployeeDepartment } from "@/lib/ai-employees/registry";

const DEPARTMENT_TO_AI: Partial<Record<DepartmentId, AiEmployeeDepartmentId>> = {
  planning: "materials",
  research: "sales",
  sales: "sales",
  marketing: "sns",
  development: "materials",
  design: "materials",
  "quality-assurance": "quality",
  "ceo-office": "delivery",
  finance: "accounting",
  hr: "secretary",
  legal: "secretary",
  "customer-success": "secretary",
};

export function mapDepartmentToAiEmployee(
  departmentId: DepartmentId,
): AiEmployeeDepartmentId {
  return DEPARTMENT_TO_AI[departmentId] ?? "materials";
}

export function pickAlternateEmployee(
  departmentId: DepartmentId,
  excludeIds: readonly EmployeeId[],
): EmployeeId | null {
  const candidates = getEmployeesByDepartment(departmentId).filter(
    (e) => !excludeIds.includes(e.id),
  );
  return candidates[0]?.id ?? null;
}

export function resolveReassignment(
  failedEmployeeId: EmployeeId,
  departmentId: DepartmentId,
): { employeeId: EmployeeId; reassigned: boolean } | null {
  const alternate = pickAlternateEmployee(departmentId, [failedEmployeeId]);
  if (!alternate) return null;
  return { employeeId: alternate, reassigned: true };
}

export function getEmployeeDisplayMeta(employeeId: EmployeeId): {
  name: string;
  departmentId: DepartmentId;
  aiDepartmentId: AiEmployeeDepartmentId;
  icon: string;
  departmentLabel: string;
} {
  const employee = resolveAssignedEmployee(employeeId);
  const fullEmployee = findEmployeeById(employee.id);
  const departmentId = fullEmployee?.department ?? "development";
  const aiDeptId = mapDepartmentToAiEmployee(departmentId);
  const aiDept = getAiEmployeeDepartment(aiDeptId);
  return {
    name: employee.name,
    departmentId,
    aiDepartmentId: aiDeptId,
    icon: aiDept.icon,
    departmentLabel: aiDept.name,
  };
}
