export type {
  TeamHandoff,
  TeamCollaborationStage,
  TeamCollaborationSnapshot,
  EmployeeTeamStat,
  EmployeeTeamStatsSnapshot,
} from "./types";

export {
  enrichTaskDependencies,
  topologicalSortTasks,
  getTaskDependencyLabels,
} from "./dependencies";

export {
  mapDepartmentToAiEmployee,
  pickAlternateEmployee,
  resolveReassignment,
  getEmployeeDisplayMeta,
} from "./employee-map";

export { buildTeamCollaborationSnapshot } from "./build-snapshot";
export { mapExecutionsToAiEmployees } from "./map-ai-employees";

export {
  recordEmployeeTeamTelemetry,
  getEmployeeTeamStatsSnapshot,
  seedDemoEmployeeStats,
} from "./telemetry";
