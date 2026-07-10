import type {
  CreateVersionInput,
  PageRequest,
  PageResult,
  Version,
  VersionFilter,
} from "../types";

/**
 * Persistence contract for immutable {@link Version} snapshots.
 * Supabase: `artifact_versions` table; append-only (no update/delete in prod).
 */
export interface VersionRepository {
  findById(id: string): Promise<Version | null>;
  findMany(
    filter?: VersionFilter,
    page?: PageRequest,
  ): Promise<PageResult<Version>>;
  /** Append-only — creates a new revision and returns it. */
  append(input: CreateVersionInput): Promise<Version>;
  /** Latest version for an artifact (convenience for read paths). */
  findLatestByArtifactId(artifactId: string): Promise<Version | null>;
}
