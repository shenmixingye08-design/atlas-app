import {
  localStorageProjectRepository,
  LocalStorageProjectRepository,
} from "./repositories/local-storage-repository";
import {
  supabaseProjectRepository,
  SupabaseProjectRepository,
} from "./repositories/supabase-project-repository";
import type { ProjectRepository } from "./repositories/types";

import {
  resolveProjectStorageBackend,
  type ProjectStorageBackend,
} from "@/lib/supabase/env";

export type ProjectRepositoryFactoryOptions = {
  backend?: ProjectStorageBackend;
  userId?: string | null;
};

/**
 * Resolve the active project repository from env or explicit options.
 *
 * Supabase is preferred when configured (see `resolveProjectStorageBackend`).
 * localStorage remains available as cache/fallback.
 */
export function createProjectRepository(
  options: ProjectRepositoryFactoryOptions = {},
): ProjectRepository {
  const backend = options.backend ?? resolveProjectStorageBackend();

  if (backend === "supabase") {
    return new SupabaseProjectRepository({ userId: options.userId ?? null });
  }

  return new LocalStorageProjectRepository();
}

/** Singleton used by the default {@link projectService} export. */
export function resolveProjectRepository(): ProjectRepository {
  return createProjectRepository();
}

export {
  LocalStorageProjectRepository,
  localStorageProjectRepository,
  SupabaseProjectRepository,
  supabaseProjectRepository,
};
