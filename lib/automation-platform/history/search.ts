import type { AutomationRun } from "@/lib/automation-platform/types";
import type { AutomationRunStatus } from "@/lib/automation-platform/types/status";

export type RunSearchFilters = {
  query?: string;
  statuses?: AutomationRunStatus[];
  automationId?: string;
  from?: string;
  to?: string;
  needsUserInput?: boolean;
  retryable?: boolean;
  hasArtifacts?: boolean;
  hasExternalAction?: boolean;
  hasRetry?: boolean;
  diagnosticId?: string;
};

const EXTERNAL_CAPS = new Set([
  "gmail",
  "x_post",
  "google_calendar",
  "wordpress",
  "dropbox",
  "notify",
]);

function matchesQuery(run: AutomationRun, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const parts = [
    run.automationName,
    run.id,
    run.diagnosticId,
    run.lastErrorCode ?? "",
    run.lastErrorMessage ?? "",
    ...run.steps.map((step) => step.name),
    ...run.steps.map((step) => step.capabilityId),
    ...run.artifacts.map((artifact) => artifact.label),
    ...(run.preparation?.externalEffects ?? []),
  ];
  return parts.some((part) => part.toLowerCase().includes(q));
}

export function filterAutomationRuns(
  runs: AutomationRun[],
  filters: RunSearchFilters = {},
): AutomationRun[] {
  const fromMs = filters.from ? Date.parse(filters.from) : null;
  const toMs = filters.to ? Date.parse(filters.to) : null;

  return runs.filter((run) => {
    if (filters.automationId && run.automationId !== filters.automationId) {
      return false;
    }
    if (filters.diagnosticId && run.diagnosticId !== filters.diagnosticId) {
      return false;
    }
    if (filters.statuses?.length && !filters.statuses.includes(run.status)) {
      return false;
    }
    if (filters.needsUserInput === true && !run.needsUserInput) {
      return false;
    }
    if (filters.retryable === true && !run.retryable) {
      return false;
    }
    if (filters.hasArtifacts === true && run.artifacts.length === 0) {
      return false;
    }
    if (filters.hasRetry === true && run.attemptCount <= 1) {
      return false;
    }
    if (filters.hasExternalAction === true) {
      const hasExternal = run.steps.some((step) =>
        EXTERNAL_CAPS.has(step.capabilityId),
      );
      if (!hasExternal) return false;
    }
    if (fromMs != null) {
      const t = Date.parse(run.createdAt);
      if (Number.isFinite(t) && t < fromMs) return false;
    }
    if (toMs != null) {
      const t = Date.parse(run.createdAt);
      if (Number.isFinite(t) && t > toMs) return false;
    }
    if (filters.query && !matchesQuery(run, filters.query)) {
      return false;
    }
    return true;
  });
}

export type RunSortKey =
  | "newest"
  | "oldest"
  | "duration"
  | "status"
  | "name";

export function sortAutomationRuns(
  runs: AutomationRun[],
  sort: RunSortKey = "newest",
): AutomationRun[] {
  const copy = [...runs];
  switch (sort) {
    case "oldest":
      return copy.sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
      );
    case "duration":
      return copy.sort(
        (a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0),
      );
    case "status":
      return copy.sort((a, b) => a.status.localeCompare(b.status));
    case "name":
      return copy.sort((a, b) =>
        a.automationName.localeCompare(b.automationName, "ja"),
      );
    case "newest":
    default:
      return copy.sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
  }
}
