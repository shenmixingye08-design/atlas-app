export type {
  ActivityEvent,
  DashboardHomeData,
  DashboardMetric,
  DepartmentEmployee,
  EmployeeActivityStatus,
  KnowledgeGrowthPoint,
  TrendDirection,
} from "./types";
export { DASHBOARD_DEPARTMENTS } from "./types";
export { useDashboardHome } from "./use-dashboard-home";
export {
  formatDashboardClock,
  getProjectDeliverableHint,
  getProjectDepartmentLabel,
  getProjectQualityScore,
} from "./utils";
