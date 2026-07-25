import "server-only";

import {
  getExecutionState,
  listExecutionLogs,
  listExecutionStatesForUser,
  type ExecutionLogEntry,
} from "@/lib/orchestration/execution-reliability";
import {
  ensureCommanderRunsHydrated,
  getCommanderRun,
  listCommanderRunsForUser,
} from "@/lib/commander/run-store";
import type { CommanderRunStatus } from "@/lib/commander/types";

import { estimateWorkEta } from "./eta";
import {
  mapRunStatusToStage,
  type WorkProgressStageId,
} from "./stages";

export type WorkProgressSnapshot = {
  runId: string;
  assignment: string;
  status: CommanderRunStatus | string;
  stage: WorkProgressStageId;
  stoppedAtStage: WorkProgressStageId | null;
  lastError: string | null;
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  updatedAt: string;
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

function toSnapshotLogs(entries: ExecutionLogEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    at: entry.at,
    message: entry.message,
    level: entry.level,
    ...(entry.stage ? { stage: entry.stage } : {}),
  }));
}

export async function getWorkProgressSnapshot(
  userId: string,
  runId: string,
): Promise<WorkProgressSnapshot | null> {
  await ensureCommanderRunsHydrated(userId);
  const run = getCommanderRun(runId, userId);
  const state = getExecutionState(runId, userId);
  if (!run && !state) return null;

  const assignment = run?.assignment ?? "";
  const eta = estimateWorkEta(assignment);
  const status = run?.status ?? state?.status ?? "running";
  const stage = mapRunStatusToStage({
    status,
    reliabilityStage: state?.stage,
  });

  return {
    runId,
    assignment,
    status,
    stage,
    stoppedAtStage: state?.stoppedAtStage ?? null,
    lastError: state?.lastError ?? run?.error ?? null,
    attempt: state?.attempt ?? run?.attempts.length ?? 1,
    maxAttempts: state?.maxAttempts ?? 3,
    startedAt: state?.startedAt ?? run?.createdAt ?? new Date().toISOString(),
    updatedAt: state?.updatedAt ?? run?.updatedAt ?? new Date().toISOString(),
    etaLabel: eta.label,
    etaMs: eta.etaMs,
    resultProjectId: run ? `commander-${run.id}` : null,
    logs: toSnapshotLogs(listExecutionLogs({ runId, userId, limit: 40 })),
  };
}

export async function listWorkProgressSnapshots(
  userId: string,
  limit = 10,
): Promise<WorkProgressSnapshot[]> {
  await ensureCommanderRunsHydrated(userId);
  const runs = listCommanderRunsForUser(userId, limit);
  const states = listExecutionStatesForUser(userId);
  const byId = new Map<string, WorkProgressSnapshot>();

  for (const run of runs) {
    const snap = await getWorkProgressSnapshot(userId, run.id);
    if (snap) byId.set(run.id, snap);
  }

  for (const state of states.slice(0, limit)) {
    if (byId.has(state.runId)) continue;
    const snap = await getWorkProgressSnapshot(userId, state.runId);
    if (snap) byId.set(state.runId, snap);
  }

  return [...byId.values()]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, limit);
}
