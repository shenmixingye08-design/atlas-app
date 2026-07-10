import { normalizeProjects } from "../domain";
import { SEED_PROJECTS } from "../mock-data";
import type { Project } from "../types";

import type { ProjectRepository } from "./types";

const STORAGE_KEY = "atlas-projects";

function persistIfChanged(
  previous: Project[],
  normalized: Project[],
): Project[] {
  if (typeof window === "undefined") return normalized;

  if (JSON.stringify(previous) !== JSON.stringify(normalized)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

/**
 * Browser localStorage implementation of {@link ProjectRepository}.
 * Swap for a Supabase repository without changing UI or service callers.
 */
export class LocalStorageProjectRepository implements ProjectRepository {
  list(): Project[] {
    if (typeof window === "undefined") {
      return normalizeProjects(SEED_PROJECTS);
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seeds = normalizeProjects(SEED_PROJECTS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
        return seeds;
      }

      const projects = JSON.parse(raw) as Project[];
      return persistIfChanged(projects, normalizeProjects(projects));
    } catch {
      return normalizeProjects(SEED_PROJECTS);
    }
  }

  save(projects: Project[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }
}

/** Default client-side repository instance. */
export const localStorageProjectRepository = new LocalStorageProjectRepository();
