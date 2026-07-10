import type { AssignedEmployeeRef, Project, ProjectStatus } from "@/lib/projects/types";

import {
  asArray,
  asIsoTimestamp,
  asNonEmptyString,
  asNumber,
  asOptionalString,
  asString,
  clampNumber,
  isRecord,
  pickEnum,
} from "./guards";

const PROJECT_STATUSES = [
  "pending",
  "running",
  "review",
  "completed",
] as const satisfies readonly ProjectStatus[];

const DEFAULT_PROJECT_STATUS: ProjectStatus = "pending";

/**
 * Normalize a legacy or partial project record for safe home/dashboard use.
 * Extend this function when new Project fields are added.
 */
export function normalizeProject(raw: unknown): Project {
  const record = isRecord(raw) ? raw : {};
  const now = new Date().toISOString();

  const result = record.result;
  const normalizedResult =
    result === null || isRecord(result) ? (result as Project["result"]) : null;

  return {
    id: asNonEmptyString(record.id, `legacy-project-${now}`),
    title: asNonEmptyString(record.title, "無題の仕事"),
    workRequest: asString(record.workRequest, ""),
    status: pickEnum(record.status, PROJECT_STATUSES, DEFAULT_PROJECT_STATUS),
    progress: clampNumber(asNumber(record.progress, 0), 0, 100),
    createdAt: asIsoTimestamp(record.createdAt, now),
    updatedAt: asIsoTimestamp(record.updatedAt, now),
    assignedEmployees: asArray<unknown>(record.assignedEmployees).filter(
      (item): item is AssignedEmployeeRef => typeof item === "string",
    ),
    result: normalizedResult,
    error: asOptionalString(record.error) ?? undefined,
  };
}

/** Normalize an array of unknown project records, skipping nothing (each item coerced). */
export function normalizeProjects(raw: unknown): Project[] {
  return asArray(raw).map(normalizeProject);
}
