import { ERROR_CATEGORY_IDS, getErrorCategoryDefinition } from "./registry";
import type {
  ErrorCategoryId,
  ErrorCategoryState,
  ErrorEventRecord,
  ErrorResolutionStatus,
} from "./types";

type CategoryBucket = Map<ErrorCategoryId, ErrorCategoryState>;
type EventBucket = ErrorEventRecord[];

const MAX_EVENTS = 500;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultState(categoryId: ErrorCategoryId): ErrorCategoryState {
  return {
    categoryId,
    occurrenceCount: 0,
    lastOccurredAt: null,
    resolutionStatus: "resolved",
    resolvedAt: null,
    lastMessage: null,
    lastStackTrace: null,
  };
}

function getCategoryBucket(): CategoryBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasErrorMonitoringCategories?: CategoryBucket;
  };

  if (!globalScope.__atlasErrorMonitoringCategories) {
    const initial = new Map<ErrorCategoryId, ErrorCategoryState>();
    for (const id of ERROR_CATEGORY_IDS) {
      initial.set(id, createDefaultState(id));
    }
    globalScope.__atlasErrorMonitoringCategories = initial;
  } else {
    // Ensure newly added categories exist on hot reload.
    for (const id of ERROR_CATEGORY_IDS) {
      if (!globalScope.__atlasErrorMonitoringCategories.has(id)) {
        globalScope.__atlasErrorMonitoringCategories.set(
          id,
          createDefaultState(id),
        );
      }
    }
  }

  return globalScope.__atlasErrorMonitoringCategories;
}

function getEventBucket(): EventBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasErrorMonitoringEvents?: EventBucket;
  };

  if (!globalScope.__atlasErrorMonitoringEvents) {
    globalScope.__atlasErrorMonitoringEvents = [];
  }

  return globalScope.__atlasErrorMonitoringEvents;
}

export function recordOwnerError(input: {
  categoryId: ErrorCategoryId;
  message?: string;
  source?: string;
  timestamp?: string;
  stackTrace?: string | null;
}): ErrorCategoryState {
  getErrorCategoryDefinition(input.categoryId);

  const timestamp = input.timestamp ?? nowIso();
  const message = input.message?.trim() || "Unknown error";
  const source = input.source ?? "system";
  const stackTrace = input.stackTrace?.trim() || null;

  getEventBucket().push({
    categoryId: input.categoryId,
    message,
    timestamp,
    source,
    stackTrace,
  });

  if (getEventBucket().length > MAX_EVENTS) {
    getEventBucket().splice(0, getEventBucket().length - MAX_EVENTS);
  }

  const current =
    getCategoryBucket().get(input.categoryId) ??
    createDefaultState(input.categoryId);

  const next: ErrorCategoryState = {
    categoryId: input.categoryId,
    occurrenceCount: current.occurrenceCount + 1,
    lastOccurredAt: timestamp,
    resolutionStatus: "open",
    resolvedAt: null,
    lastMessage: message,
    lastStackTrace: stackTrace,
  };

  getCategoryBucket().set(input.categoryId, next);
  return next;
}

export function setErrorCategoryResolution(
  categoryId: ErrorCategoryId,
  resolutionStatus: ErrorResolutionStatus,
): ErrorCategoryState {
  getErrorCategoryDefinition(categoryId);

  const current =
    getCategoryBucket().get(categoryId) ?? createDefaultState(categoryId);

  const next: ErrorCategoryState = {
    ...current,
    resolutionStatus,
    resolvedAt: resolutionStatus === "resolved" ? nowIso() : null,
  };

  getCategoryBucket().set(categoryId, next);
  return next;
}

export function listErrorCategoryStates(): ErrorCategoryState[] {
  return ERROR_CATEGORY_IDS.map(
    (id) => getCategoryBucket().get(id) ?? createDefaultState(id),
  );
}

export function listErrorEvents(categoryId?: ErrorCategoryId): ErrorEventRecord[] {
  const events = getEventBucket();
  if (!categoryId) return [...events].reverse();
  return events.filter((event) => event.categoryId === categoryId).reverse();
}

export function resetErrorMonitoringStore(): void {
  getCategoryBucket().clear();
  for (const id of ERROR_CATEGORY_IDS) {
    getCategoryBucket().set(id, createDefaultState(id));
  }
  getEventBucket().length = 0;
}
