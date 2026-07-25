/**
 * Client-side persistence for in-flight work so refresh / reconnect
 * can restore progress UI. Server durability remains Clerk/commander store.
 */

import type { WorkActionLogEntry } from "./action-logs";
import type { WorkEtaBucket } from "./eta";
import type { WorkProgressStageId } from "./stages";

export const WORK_PROGRESS_SESSION_KEY = "minervot.activeWorkProgress.v1";

export type ActiveWorkSession = {
  version: 1;
  sessionId: string;
  runId: string | null;
  assignment: string;
  startedAt: string;
  updatedAt: string;
  etaMs: number;
  etaBucket: WorkEtaBucket;
  etaLabel: string;
  stage: WorkProgressStageId;
  status: "running" | "awaiting_confirmation" | "completed" | "failed" | "partial";
  logs: WorkActionLogEntry[];
  lastError: string | null;
  stoppedAtStage: WorkProgressStageId | null;
  attempt: number;
  maxAttempts: number;
  resultProjectId: string | null;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function createActiveWorkSession(input: {
  assignment: string;
  etaMs: number;
  etaBucket: WorkEtaBucket;
  etaLabel: string;
  runId?: string | null;
}): ActiveWorkSession {
  const now = new Date().toISOString();
  return {
    version: 1,
    sessionId: `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    runId: input.runId ?? null,
    assignment: input.assignment.trim(),
    startedAt: now,
    updatedAt: now,
    etaMs: input.etaMs,
    etaBucket: input.etaBucket,
    etaLabel: input.etaLabel,
    stage: "accepted",
    status: "running",
    logs: [],
    lastError: null,
    stoppedAtStage: null,
    attempt: 1,
    maxAttempts: 3,
    resultProjectId: null,
  };
}

export function saveActiveWorkSession(session: ActiveWorkSession): void {
  if (!canUseStorage()) return;
  try {
    const next = { ...session, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(WORK_PROGRESS_SESSION_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — non-fatal.
  }
}

export function loadActiveWorkSession(): ActiveWorkSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(WORK_PROGRESS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveWorkSession;
    if (!parsed || parsed.version !== 1 || !parsed.assignment) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveWorkSession(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(WORK_PROGRESS_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function isSessionActive(session: ActiveWorkSession): boolean {
  return (
    session.status === "running" ||
    session.status === "awaiting_confirmation" ||
    session.status === "partial"
  );
}

/** Drop stale sessions older than 2 hours that never finished. */
export function shouldRestoreSession(session: ActiveWorkSession, nowMs = Date.now()): boolean {
  const started = Date.parse(session.startedAt);
  if (Number.isNaN(started)) return false;
  if (nowMs - started > 2 * 60 * 60 * 1000) return false;
  return true;
}
