/**
 * @deprecated Import from `@/lib/departments` for full definitions.
 * Re-exports preserved for backward compatibility.
 */

import {
  allDepartments,
  departmentRegistry,
} from "@/lib/departments/registry";

import type { Department, DepartmentId } from "./types";

export { departmentRegistry, allDepartments };

/** @deprecated Use `allDepartments` from `@/lib/departments`. */
export const DEPARTMENTS = {
  ceoOffice: departmentRegistry["ceo-office"],
  sales: departmentRegistry.sales,
  planning: departmentRegistry.planning,
  research: departmentRegistry.research,
  development: departmentRegistry.development,
  design: departmentRegistry.design,
  marketing: departmentRegistry.marketing,
  legal: departmentRegistry.legal,
  finance: departmentRegistry.finance,
  hr: departmentRegistry.hr,
  customerSuccess: departmentRegistry["customer-success"],
  qualityAssurance: departmentRegistry["quality-assurance"],
} as const satisfies Record<string, Department>;

export type { Department, DepartmentId };
