import type { Automation } from "@/lib/automations/types";
import type { IntegrationCatalog } from "@/lib/integrations/types";
import { getDepartmentLabel, ui } from "@/lib/i18n";
import type { KnowledgeEntry } from "@/lib/knowledge/types";
import type { Project } from "@/lib/projects/types";
import type { WorkflowPackageView } from "@/lib/workflow-marketplace/types";

function dashboardDepartmentLabel(id: string): string {
  if (id === "ceo") return ui.workflowPhases.ceo;
  if (id === "qa") return ui.workflowPhases.qa;
  if (id === "automation") return ui.nav.automations;
  return getDepartmentLabel(id);
}

export type TrendDirection = "up" | "down" | "neutral";

export type DashboardMetric = {
  id: string;
  label: string;
  value: string | number;
  subtitle: string;
  icon: string;
  trend: TrendDirection;
  trendLabel: string;
};

export type EmployeeActivityStatus =
  | "idle"
  | "thinking"
  | "working"
  | "reviewing"
  | "completed";

export type DepartmentEmployee = {
  id: string;
  name: string;
  icon: string;
  status: EmployeeActivityStatus;
  lastActivity: string | null;
};

export type ActivityEvent = {
  id: string;
  type:
    | "research"
    | "ceo"
    | "deliverable"
    | "drive"
    | "automation"
    | "knowledge"
    | "project";
  title: string;
  description?: string;
  timestamp: string;
  icon: string;
};

export type KnowledgeGrowthPoint = {
  label: string;
  count: number;
};

export type DashboardHomeData = {
  metrics: DashboardMetric[];
  employees: DepartmentEmployee[];
  activity: ActivityEvent[];
  knowledgeRecent: KnowledgeEntry[];
  knowledgeReused: KnowledgeEntry[];
  knowledgeGrowth: KnowledgeGrowthPoint[];
  recommendedPackages: WorkflowPackageView[];
  integrationsCatalog: IntegrationCatalog | null;
  automations: Automation[];
  hoursSavedThisWeek: number;
};

export const DASHBOARD_DEPARTMENTS = [
  { id: "ceo", name: dashboardDepartmentLabel("ceo"), icon: "👔" },
  { id: "planning", name: dashboardDepartmentLabel("planning"), icon: "📋" },
  { id: "research", name: dashboardDepartmentLabel("research"), icon: "🔍" },
  { id: "development", name: dashboardDepartmentLabel("development"), icon: "⚡" },
  { id: "marketing", name: dashboardDepartmentLabel("marketing"), icon: "📣" },
  { id: "qa", name: dashboardDepartmentLabel("qa"), icon: "◎" },
  { id: "automation", name: dashboardDepartmentLabel("automation"), icon: "🔄" },
] as const;
