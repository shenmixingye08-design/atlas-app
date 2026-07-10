export { customerSuccessEmployees, csDirector, supportLead } from "./customer-success";
export { hrEmployees, hrDirector, talentPartner } from "./hr";
export { ceoOfficeEmployees, atlasCeo, executiveAssistant } from "./ceo-office";
export { salesEmployees, salesDirector, accountExecutive } from "./sales";
export { planningEmployees, leadPlanner, projectCoordinator } from "./planning";
export { researchEmployees, researchLead, dataAnalyst } from "./research";
export {
  developmentEmployees,
  seniorDeveloper,
  fullStackEngineer,
} from "./development";
export { designEmployees, creativeDirector, uiDesigner } from "./design";
export {
  marketingEmployees,
  marketingDirector,
  contentStrategist,
} from "./marketing";
export { legalEmployees, generalCounsel, complianceOfficer } from "./legal";
export { financeEmployees, financeDirector, financialAnalyst } from "./finance";
export {
  qualityAssuranceEmployees,
  qualityLead,
  qaSpecialist,
} from "./quality-assurance";

import { ceoOfficeEmployees } from "./ceo-office";
import { customerSuccessEmployees } from "./customer-success";
import { designEmployees } from "./design";
import { developmentEmployees } from "./development";
import { financeEmployees } from "./finance";
import { hrEmployees } from "./hr";
import { legalEmployees } from "./legal";
import { marketingEmployees } from "./marketing";
import { planningEmployees } from "./planning";
import { qualityAssuranceEmployees } from "./quality-assurance";
import { researchEmployees } from "./research";
import { salesEmployees } from "./sales";

/** Flat list of every employee across all departments. Extend by adding to department files. */
export const allDepartmentEmployees = [
  ...ceoOfficeEmployees,
  ...salesEmployees,
  ...planningEmployees,
  ...researchEmployees,
  ...developmentEmployees,
  ...designEmployees,
  ...marketingEmployees,
  ...legalEmployees,
  ...financeEmployees,
  ...hrEmployees,
  ...customerSuccessEmployees,
  ...qualityAssuranceEmployees,
] as const;
