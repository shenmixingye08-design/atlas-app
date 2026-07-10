import { ui } from "@/lib/i18n";

import type {
  AiEmployeeDepartmentDefinition,
  AiEmployeeDepartmentId,
} from "./types";

const salesDepartment: AiEmployeeDepartmentDefinition = {
  id: "sales",
  icon: "👔",
  name: ui.aiEmployees.departments.sales.name,
  tasks: ui.aiEmployees.departments.sales.tasks,
  defaultVisible: true,
  sortOrder: 10,
};

const materialsDepartment: AiEmployeeDepartmentDefinition = {
  id: "materials",
  icon: "📊",
  name: ui.aiEmployees.departments.materials.name,
  tasks: ui.aiEmployees.departments.materials.tasks,
  defaultVisible: true,
  sortOrder: 20,
};

const qualityDepartment: AiEmployeeDepartmentDefinition = {
  id: "quality",
  icon: "🧐",
  name: ui.aiEmployees.departments.quality.name,
  tasks: ui.aiEmployees.departments.quality.tasks,
  defaultVisible: true,
  sortOrder: 30,
};

const deliveryDepartment: AiEmployeeDepartmentDefinition = {
  id: "delivery",
  icon: "📦",
  name: ui.aiEmployees.departments.delivery.name,
  tasks: ui.aiEmployees.departments.delivery.tasks,
  defaultVisible: true,
  sortOrder: 40,
};

/** Future departments — register here when product flows are ready. */
const futureDepartments: readonly AiEmployeeDepartmentDefinition[] = [
  {
    id: "sns",
    icon: "📱",
    name: ui.aiEmployees.departments.sns.name,
    tasks: ui.aiEmployees.departments.sns.tasks,
    defaultVisible: true,
    sortOrder: 15,
  },
  {
    id: "video",
    icon: "🎬",
    name: ui.aiEmployees.departments.video.name,
    tasks: ui.aiEmployees.departments.video.tasks,
    defaultVisible: false,
    sortOrder: 60,
  },
  {
    id: "accounting",
    icon: "💰",
    name: ui.aiEmployees.departments.accounting.name,
    tasks: ui.aiEmployees.departments.accounting.tasks,
    defaultVisible: false,
    sortOrder: 70,
  },
  {
    id: "secretary",
    icon: "🗂️",
    name: ui.aiEmployees.departments.secretary.name,
    tasks: ui.aiEmployees.departments.secretary.tasks,
    defaultVisible: true,
    sortOrder: 12,
  },
];

const allDefinitions: readonly AiEmployeeDepartmentDefinition[] = [
  salesDepartment,
  materialsDepartment,
  qualityDepartment,
  deliveryDepartment,
  ...futureDepartments,
];

export const aiEmployeeDepartmentRegistry: Readonly<
  Record<AiEmployeeDepartmentId, AiEmployeeDepartmentDefinition>
> = Object.fromEntries(allDefinitions.map((dept) => [dept.id, dept])) as Record<
  AiEmployeeDepartmentId,
  AiEmployeeDepartmentDefinition
>;

export const defaultVisibleAiEmployeeDepartments: readonly AiEmployeeDepartmentDefinition[] =
  allDefinitions
    .filter((dept) => dept.defaultVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export function getAiEmployeeDepartment(
  id: AiEmployeeDepartmentId,
): AiEmployeeDepartmentDefinition {
  const department = aiEmployeeDepartmentRegistry[id];
  if (!department) {
    throw new Error(`AI employee department not found: ${id}`);
  }
  return department;
}

export function registerAiEmployeeDepartment(
  definition: AiEmployeeDepartmentDefinition,
): void {
  (aiEmployeeDepartmentRegistry as Record<string, AiEmployeeDepartmentDefinition>)[
    definition.id
  ] = definition;
}
