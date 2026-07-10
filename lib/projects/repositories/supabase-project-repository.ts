import { normalizeProjects } from "../domain";
import type { Project } from "../types";

import {
  mapProjectToRow,
  mapRowsToProjects,
  PROJECTS_TABLE,
  type ProjectRow,
} from "./project-row";
import type { ProjectRepository } from "./types";

import { createClientIfConfigured } from "@/lib/supabase/client";

export type SupabaseProjectRepositoryOptions = {
  /**
   * Clerk user id for row scoping once RLS is enabled.
   * Legacy projects without auth may pass null until migration.
   */
  userId?: string | null;
};

/**
 * Supabase-backed {@link ProjectRepository}.
 *
 * Implements the same sync `list` / `save` contract as
 * {@link LocalStorageProjectRepository} using an in-memory cache that is
 * hydrated and persisted asynchronously. Call {@link hydrate} before relying
 * on `list()` when this backend is active.
 *
 * Requires the `projects` table (see migration SQL in project docs).
 */
export class SupabaseProjectRepository implements ProjectRepository {
  private cache: Project[] | null = null;
  private readonly userId: string | null;

  constructor(options: SupabaseProjectRepositoryOptions = {}) {
    this.userId = options.userId ?? null;
  }

  /** Sync read from the in-memory cache (empty until {@link hydrate}). */
  list(): Project[] {
    return this.cache ?? [];
  }

  /**
   * Sync write to cache with async Supabase upsert/reconcile.
   * Mirrors localStorage full-collection replace semantics.
   */
  save(projects: Project[]): void {
    this.cache = normalizeProjects(projects);
    void this.persist(this.cache);
  }

  /** Load projects from Supabase into the cache. */
  async hydrate(): Promise<Project[]> {
    const client = createClientIfConfigured();
    if (!client) {
      console.warn(
        "[SupabaseProjectRepository] Supabase env vars missing — hydrate skipped.",
      );
      this.cache = [];
      return this.cache;
    }

    let query = client
      .from(PROJECTS_TABLE)
      .select("*")
      .order("updated_at", { ascending: false });

    if (this.userId) {
      query = query.eq("user_id", this.userId);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(
        "[SupabaseProjectRepository] hydrate failed (table may not exist yet):",
        error.message,
      );
      this.cache = [];
      return this.cache;
    }

    this.cache = normalizeProjects(
      mapRowsToProjects((data ?? []) as ProjectRow[]),
    );
    return this.cache;
  }

  private async persist(projects: Project[]): Promise<void> {
    const client = createClientIfConfigured();
    if (!client) {
      console.warn(
        "[SupabaseProjectRepository] Supabase env vars missing — persist skipped.",
      );
      return;
    }

    const rows = projects.map((project) =>
      mapProjectToRow(project, this.userId),
    );
    const ids = rows.map((row) => row.id);

    if (rows.length > 0) {
      const { error: upsertError } = await client
        .from(PROJECTS_TABLE)
        .upsert(rows, { onConflict: "id" });

      if (upsertError) {
        console.warn(
          "[SupabaseProjectRepository] upsert failed:",
          upsertError.message,
        );
        return;
      }
    }

    // Full-replace reconcile only when scoped to a user (RLS-ready).
    if (!this.userId) return;

    let deleteQuery = client
      .from(PROJECTS_TABLE)
      .delete()
      .eq("user_id", this.userId);

    if (ids.length > 0) {
      const inList = `(${ids.map((id) => `"${id}"`).join(",")})`;
      deleteQuery = deleteQuery.not("id", "in", inList);
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.warn(
        "[SupabaseProjectRepository] delete reconcile failed:",
        deleteError.message,
      );
    }
  }
}

/** Shared Supabase repository instance (configure `userId` per session later). */
export const supabaseProjectRepository = new SupabaseProjectRepository();
