export { ceoOfficeDepartment } from "./ceo-office";
export { planningDepartment } from "./planning";
export { qualityAssuranceDepartment } from "./quality-assurance";
export { developmentDepartment } from "./development";
export { marketingDepartment } from "./marketing";
export { salesDepartment } from "./sales";
export { designDepartment } from "./design";
export { researchDepartment } from "./research";
export { legalDepartment } from "./legal";
export { financeDepartment } from "./finance";
export { hrDepartment } from "./hr";
export { customerSuccessDepartment } from "./customer-success";

import { ceoOfficeDepartment } from "./ceo-office";
import { customerSuccessDepartment } from "./customer-success";
import { designDepartment } from "./design";
import { developmentDepartment } from "./development";
import { financeDepartment } from "./finance";
import { hrDepartment } from "./hr";
import { legalDepartment } from "./legal";
import { marketingDepartment } from "./marketing";
import { planningDepartment } from "./planning";
import { qualityAssuranceDepartment } from "./quality-assurance";
import { researchDepartment } from "./research";
import { salesDepartment } from "./sales";

import type { DepartmentDefinition } from "../types";

/** All department definitions in display order. */
export const allDepartmentDefinitions = [
  ceoOfficeDepartment,
  planningDepartment,
  developmentDepartment,
  marketingDepartment,
  salesDepartment,
  designDepartment,
  researchDepartment,
  legalDepartment,
  financeDepartment,
  hrDepartment,
  customerSuccessDepartment,
  qualityAssuranceDepartment,
] as const satisfies readonly DepartmentDefinition[];

/** Worker-eligible department definitions only. */
export const workerDepartmentDefinitions = allDepartmentDefinitions.filter(
  (department) => department.workerEligible,
);
