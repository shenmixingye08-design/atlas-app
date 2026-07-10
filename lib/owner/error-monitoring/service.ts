import "server-only";

import { getErrorCategoryDefinition, isErrorCategoryId } from "./registry";
import {
  listErrorCategoryStates,
  recordOwnerError,
  setErrorCategoryResolution,
} from "./store";
import type {
  ErrorCategoryId,
  ErrorCategorySnapshot,
  ErrorMonitoringSnapshot,
  ErrorResolutionStatus,
} from "./types";

export function buildErrorMonitoringSnapshot(
  now: Date = new Date(),
): ErrorMonitoringSnapshot {
  const categories = listErrorCategoryStates().map((state): ErrorCategorySnapshot => {
    const definition = getErrorCategoryDefinition(state.categoryId);
    return {
      ...state,
      label: definition.label,
      description: definition.description,
    };
  });

  return {
    categories,
    openCount: categories.filter(
      (category) =>
        category.resolutionStatus === "open" && category.occurrenceCount > 0,
    ).length,
    generatedAt: now.toISOString(),
  };
}

export function getErrorMonitoringSnapshot(): ErrorMonitoringSnapshot {
  return buildErrorMonitoringSnapshot();
}

export { recordOwnerError };

export function parseErrorResolutionUpdate(body: unknown):
  | { categoryId: ErrorCategoryId; resolutionStatus: ErrorResolutionStatus }
  | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const record = body as {
    categoryId?: unknown;
    resolutionStatus?: unknown;
  };

  if (typeof record.categoryId !== "string" || !isErrorCategoryId(record.categoryId)) {
    return { error: "categoryId is invalid" };
  }

  if (record.resolutionStatus !== "open" && record.resolutionStatus !== "resolved") {
    return { error: "resolutionStatus must be open or resolved" };
  }

  return {
    categoryId: record.categoryId,
    resolutionStatus: record.resolutionStatus,
  };
}

export function updateErrorCategoryResolution(
  categoryId: ErrorCategoryId,
  resolutionStatus: ErrorResolutionStatus,
): ErrorMonitoringSnapshot {
  setErrorCategoryResolution(categoryId, resolutionStatus);
  return getErrorMonitoringSnapshot();
}
