"use client";

import { useEffect, useRef, useState } from "react";

import {
  createActionLogEntry,
  ensureStageLogs,
  type WorkActionLogEntry,
} from "./action-logs";
import {
  clearActiveWorkSession,
  createActiveWorkSession,
  isSessionActive,
  loadActiveWorkSession,
  saveActiveWorkSession,
  shouldRestoreSession,
  type ActiveWorkSession,
} from "./client-session";
import { estimateWorkEta } from "./eta";
import { buildWorkFailureInfo, type WorkFailureInfo } from "./failure";
import {
  buildStageViews,
  estimateStageFromElapsed,
  type WorkProgressStageId,
  type WorkProgressStageView,
} from "./stages";

export type ActiveWorkProgressView = {
  session: ActiveWorkSession | null;
  stages: WorkProgressStageView[];
  logs: WorkActionLogEntry[];
  etaLabel: string;
  failure: WorkFailureInfo | null;
  isRestored: boolean;
};

type ServerSnapshot = {
  runId: string;
  assignment: string;
  status: string;
  stage: WorkProgressStageId;
  stoppedAtStage: WorkProgressStageId | null;
  lastError: string | null;
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  etaLabel: string;
  etaMs: number;
  resultProjectId: string | null;
  logs: Array<{
    id: string;
    at: string;
    message: string;
    level: "info" | "warn" | "error";
    stage?: WorkProgressStageId;
  }>;
};

async function fetchSnapshot(runId: string): Promise<ServerSnapshot | null> {
  try {
    const response = await fetch(
      `/api/work-progress?runId=${encodeURIComponent(runId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { snapshot?: ServerSnapshot };
    return data.snapshot ?? null;
  } catch {
    return null;
  }
}

async function fetchActiveSnapshots(): Promise<ServerSnapshot[]> {
  try {
    const response = await fetch("/api/work-progress", { cache: "no-store" });
    if (!response.ok) return [];
    const data = (await response.json()) as { snapshots?: ServerSnapshot[] };
    return data.snapshots ?? [];
  } catch {
    return [];
  }
}

function toView(session: ActiveWorkSession | null, isRestored: boolean): ActiveWorkProgressView {
  if (!session) {
    return {
      session: null,
      stages: buildStageViews({ current: "accepted" }),
      logs: [],
      etaLabel: "約2分",
      failure: null,
      isRestored: false,
    };
  }

  const failed = session.status === "failed";
  return {
    session,
    stages: buildStageViews({ current: session.stage, failed }),
    logs: session.logs,
    etaLabel: session.etaLabel,
    failure: failed
      ? buildWorkFailureInfo({
          error: session.lastError ?? "実行に失敗しました",
          stoppedAtStage: session.stoppedAtStage ?? session.stage,
          attempt: session.attempt,
          maxAttempts: session.maxAttempts,
        })
      : null,
    isRestored,
  };
}

/**
 * Client progress controller:
 * - starts a session with ETA + stage logs
 * - advances stages while a blocking execute is in flight
 * - persists to localStorage for refresh restore
 * - hydrates from /api/work-progress after login / reconnect
 */
export function useActiveWorkProgress() {
  const [view, setView] = useState<ActiveWorkProgressView>(() =>
    toView(null, false),
  );
  const sessionRef = useRef<ActiveWorkSession | null>(null);
  const tickRef = useRef<number | null>(null);

  const commit = (session: ActiveWorkSession | null, isRestored = false) => {
    sessionRef.current = session;
    if (session) saveActiveWorkSession(session);
    else clearActiveWorkSession();
    setView(toView(session, isRestored));
  };

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const local = loadActiveWorkSession();
      if (local && shouldRestoreSession(local) && isSessionActive(local)) {
        if (!cancelled) commit(local, true);
      }

      const snapshots = await fetchActiveSnapshots();
      if (cancelled) return;

      const active = snapshots.find(
        (snap) =>
          snap.status === "running" ||
          snap.status === "planning" ||
          snap.status === "awaiting_confirmation" ||
          snap.status === "retrying",
      );

      if (active) {
        const eta = estimateWorkEta(active.assignment);
        const next: ActiveWorkSession = {
          version: 1,
          sessionId: local?.sessionId ?? `ws_restore_${active.runId}`,
          runId: active.runId,
          assignment: active.assignment,
          startedAt: active.startedAt,
          updatedAt: new Date().toISOString(),
          etaMs: active.etaMs || eta.etaMs,
          etaBucket: eta.bucket,
          etaLabel: active.etaLabel || eta.label,
          stage: active.stage,
          status:
            active.status === "awaiting_confirmation"
              ? "awaiting_confirmation"
              : "running",
          logs: active.logs.map((log) =>
            createActionLogEntry({
              id: log.id,
              at: log.at,
              message: log.message,
              level: log.level,
              stage: log.stage ?? active.stage,
            }),
          ),
          lastError: active.lastError,
          stoppedAtStage: active.stoppedAtStage,
          attempt: active.attempt,
          maxAttempts: active.maxAttempts,
          resultProjectId: active.resultProjectId,
        };
        commit(next, true);
        return;
      }

      if (local?.runId) {
        const snap = await fetchSnapshot(local.runId);
        if (!snap || cancelled) return;
        if (snap.status === "completed" || snap.status === "partial") {
          clearActiveWorkSession();
          if (!cancelled) commit(null, false);
        } else if (snap.status === "failed") {
          const failed: ActiveWorkSession = {
            ...local,
            status: "failed",
            stage: snap.stage,
            lastError: snap.lastError,
            stoppedAtStage: snap.stoppedAtStage ?? snap.stage,
            logs: snap.logs.map((log) =>
              createActionLogEntry({
                id: log.id,
                at: log.at,
                message: log.message,
                level: log.level,
                stage: log.stage ?? snap.stage,
              }),
            ),
          };
          commit(failed, true);
        }
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionId = view.session?.sessionId ?? null;
  const sessionStatus = view.session?.status ?? null;

  useEffect(() => {
    if (!sessionId || sessionStatus !== "running") {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    tickRef.current = window.setInterval(() => {
      const current = sessionRef.current;
      if (!current || current.status !== "running") return;
      const elapsed = Date.now() - Date.parse(current.startedAt);
      const nextStage = estimateStageFromElapsed({
        elapsedMs: elapsed,
        etaMs: current.etaMs,
      });
      if (nextStage === current.stage) return;
      const withLogs = ensureStageLogs(
        current.logs,
        nextStage,
        current.assignment,
      );
      commit({ ...current, stage: nextStage, logs: withLogs });
    }, 1200);

    return () => {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [sessionId, sessionStatus]);

  const start = (assignment: string) => {
    const eta = estimateWorkEta(assignment);
    let session = createActiveWorkSession({
      assignment,
      etaMs: eta.etaMs,
      etaBucket: eta.bucket,
      etaLabel: eta.label,
    });
    session = {
      ...session,
      logs: ensureStageLogs([], "accepted", assignment, session.startedAt),
    };
    commit(session, false);
    return session;
  };

  const markFailed = (error: unknown, stoppedAtStage?: WorkProgressStageId) => {
    const current = sessionRef.current;
    if (!current) return;
    const failure = buildWorkFailureInfo({
      error,
      stoppedAtStage: stoppedAtStage ?? current.stage,
      attempt: current.attempt,
      maxAttempts: current.maxAttempts,
    });
    const logs = [
      ...current.logs,
      createActionLogEntry({
        message: failure.cause,
        stage: failure.stoppedAtStage,
        level: "error",
      }),
    ];
    commit({
      ...current,
      status: "failed",
      stage: failure.stoppedAtStage,
      stoppedAtStage: failure.stoppedAtStage,
      lastError: failure.cause,
      logs,
    });
  };

  const markCompleted = (runId?: string | null, projectId?: string | null) => {
    const current = sessionRef.current;
    if (!current) {
      clearActiveWorkSession();
      commit(null, false);
      return;
    }
    const logs = ensureStageLogs(
      current.logs,
      "delivered",
      current.assignment,
    );
    commit({
      ...current,
      runId: runId ?? current.runId,
      resultProjectId: projectId ?? current.resultProjectId,
      status: "completed",
      stage: "delivered",
      logs,
      lastError: null,
      stoppedAtStage: null,
    });
    // Keep briefly then clear so refresh after complete doesn't re-open progress.
    window.setTimeout(() => {
      clearActiveWorkSession();
    }, 1500);
  };

  const attachRunId = (runId: string) => {
    const current = sessionRef.current;
    if (!current) return;
    commit({ ...current, runId });
  };

  const clear = () => commit(null, false);

  return {
    ...view,
    start,
    markFailed,
    markCompleted,
    attachRunId,
    clear,
  };
}
