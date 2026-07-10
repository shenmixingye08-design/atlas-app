export type { CreateProjectInput, Project, ProjectStatus } from "./types";
export { SEED_PROJECTS, progressForStatus } from "./mock-data";
export {
  ProjectService,
  createProjectService,
  projectService,
} from "./project-service";
export type { CreateProjectServiceOptions } from "./project-service";
export type { ProjectRepository } from "./repositories/types";
export {
  createProjectRepository,
  resolveProjectRepository,
  LocalStorageProjectRepository,
  localStorageProjectRepository,
  SupabaseProjectRepository,
  supabaseProjectRepository,
} from "./repository-provider";
export type { ProjectRepositoryFactoryOptions } from "./repository-provider";
export { PROJECTS_TABLE } from "./repositories/project-row";
export type { ProjectRow } from "./repositories/project-row";
export {
  createProject,
  createProjectFromOrchestration,
  normalizeProjects,
} from "./domain";
export {
  filterProjects,
  formatProjectDate,
  formatRelativeDate,
} from "./utils";
export { useProjects } from "./use-projects";

/** @deprecated Import from `@/lib/projects/project-service` or `@/lib/projects/utils` */
export {
  loadProjects,
  saveProjects,
  saveProjectFromOrchestration,
} from "./storage";
