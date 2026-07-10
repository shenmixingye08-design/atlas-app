/**
 * @deprecated Import from `@/lib/projects/project-service` or `@/lib/projects/utils`.
 * Re-exports preserved for backward compatibility during storage migration.
 */

import { projectService } from "./project-service";

export { createProject, createProjectFromOrchestration } from "./domain";
export { projectService } from "./project-service";
export {
  filterProjects,
  formatProjectDate,
  formatRelativeDate,
} from "./utils";

/** @deprecated Use `projectService.list()` */
export function loadProjects() {
  return projectService.list();
}

/** @deprecated Use `projectService.saveAll()` */
export function saveProjects(projects: Parameters<typeof projectService.saveAll>[0]) {
  projectService.saveAll(projects);
}

/** @deprecated Use `projectService.saveFromOrchestration()` */
export function saveProjectFromOrchestration(
  workRequest: string,
  result: Parameters<typeof projectService.saveFromOrchestration>[1],
) {
  return projectService.saveFromOrchestration(workRequest, result);
}
