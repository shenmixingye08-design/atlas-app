import type { EntityId, Timestamp } from "./common";

/** Category of generated or uploaded project output. */
export type ArtifactKind =
  | "deliverable"
  | "document"
  | "code"
  | "plan"
  | "review"
  | "analysis"
  | "attachment";

/**
 * A logical output produced during a project (deliverable, doc, code, etc.).
 *
 * Relationship: Project 1──* Artifact
 * Relationship: WorkflowRun 0..1──* Artifact
 * Relationship: Artifact 1──* Version
 */
export interface Artifact {
  id: EntityId;
  projectId: EntityId;
  workflowRunId: EntityId | null;
  kind: ArtifactKind;
  title: string;
  /** Points to the latest immutable {@link Version}. */
  currentVersionId: EntityId | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CreateArtifactInput = {
  projectId: EntityId;
  workflowRunId?: EntityId | null;
  kind: ArtifactKind;
  title: string;
};

export type UpdateArtifactInput = Partial<
  Pick<Artifact, "title" | "currentVersionId">
> & {
  id: EntityId;
};

export type ArtifactFilter = {
  projectId?: EntityId;
  workflowRunId?: EntityId;
  kind?: ArtifactKind | ArtifactKind[];
  ids?: EntityId[];
};
