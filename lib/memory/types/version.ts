import type { EmployeeId } from "@/lib/employees/types";

import type { EntityId, Timestamp } from "./common";

/** MIME-style hint for artifact body storage and rendering. */
export type VersionContentType =
  | "text/plain"
  | "text/markdown"
  | "application/json"
  | "text/html"
  | "application/typescript"
  | "application/javascript";

/**
 * Immutable snapshot of an artifact's content at a point in time.
 *
 * Relationship: Artifact 1──* Version
 * Optional provenance: EmployeeAction that produced this revision.
 */
export interface Version {
  id: EntityId;
  artifactId: EntityId;
  versionNumber: number;
  content: string;
  contentType: VersionContentType;
  /** Human-readable summary of what changed in this revision. */
  changeSummary: string | null;
  /** Employee credited with this revision, if any. */
  createdByEmployeeId: EmployeeId | null;
  /** Link to the pipeline step that produced this version. */
  employeeActionId: EntityId | null;
  createdAt: Timestamp;
}

export type CreateVersionInput = {
  artifactId: EntityId;
  versionNumber: number;
  content: string;
  contentType: VersionContentType;
  changeSummary?: string | null;
  createdByEmployeeId?: EmployeeId | null;
  employeeActionId?: EntityId | null;
};

export type VersionFilter = {
  artifactId?: EntityId;
  ids?: EntityId[];
  employeeActionId?: EntityId;
};
