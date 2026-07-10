import type {
  Artifact,
  ArtifactFilter,
  CreateArtifactInput,
  PageRequest,
  PageResult,
  UpdateArtifactInput,
} from "../types";

/**
 * Persistence contract for {@link Artifact} outputs.
 * Supabase: `artifacts` table; large bodies live in `versions`.
 */
export interface ArtifactRepository {
  findById(id: string): Promise<Artifact | null>;
  findMany(
    filter?: ArtifactFilter,
    page?: PageRequest,
  ): Promise<PageResult<Artifact>>;
  create(input: CreateArtifactInput): Promise<Artifact>;
  update(input: UpdateArtifactInput): Promise<Artifact>;
  delete(id: string): Promise<void>;
}
