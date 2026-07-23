import type { AutomationRunArtifacts, AutomationRunHistoryEntry } from "./types";

/** Normalize legacy/partial history rows from durable storage. */
export function normalizeRunHistoryEntry(
  raw: Partial<AutomationRunHistoryEntry> & {
    id?: string;
    status?: string;
    startedAt?: string;
    completedAt?: string;
  },
): AutomationRunHistoryEntry | null {
  if (!raw || typeof raw.id !== "string" || !raw.startedAt || !raw.completedAt) {
    return null;
  }

  const status =
    raw.status === "completed" || raw.status === "failed" || raw.status === "retrying"
      ? raw.status
      : "failed";

  const startedMs = new Date(raw.startedAt).getTime();
  const completedMs = new Date(raw.completedAt).getTime();
  const durationMs =
    typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs)
      ? Math.max(0, raw.durationMs)
      : Number.isFinite(startedMs) && Number.isFinite(completedMs)
        ? Math.max(0, completedMs - startedMs)
        : 0;

  const artifacts: AutomationRunArtifacts | null =
    raw.artifacts && typeof raw.artifacts === "object"
      ? {
          tweetUrl: raw.artifacts.tweetUrl ?? null,
          tweetId: raw.artifacts.tweetId ?? null,
          deliverableCount: raw.artifacts.deliverableCount,
          preview: raw.artifacts.preview ?? null,
        }
      : null;

  return {
    id: raw.id,
    status,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    durationMs,
    error: typeof raw.error === "string" ? raw.error : null,
    triggerType: typeof raw.triggerType === "string" ? raw.triggerType : "automation",
    attempt:
      typeof raw.attempt === "number" && raw.attempt >= 1
        ? Math.min(3, Math.floor(raw.attempt))
        : 1,
    deliverablePreview:
      typeof raw.deliverablePreview === "string" ? raw.deliverablePreview : null,
    artifacts,
    actions: Array.isArray(raw.actions)
      ? raw.actions.filter((a): a is string => typeof a === "string").slice(0, 20)
      : [],
    apisUsed: Array.isArray(raw.apisUsed)
      ? raw.apisUsed.filter((a): a is string => typeof a === "string").slice(0, 20)
      : [],
  };
}

export function normalizeRunHistory(
  raw: unknown,
  max = 20,
): AutomationRunHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) =>
      normalizeRunHistoryEntry(
        (row ?? {}) as Partial<AutomationRunHistoryEntry> & {
          id?: string;
          status?: string;
          startedAt?: string;
          completedAt?: string;
        },
      ),
    )
    .filter((row): row is AutomationRunHistoryEntry => row != null)
    .slice(0, max);
}
