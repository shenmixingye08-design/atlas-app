import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import type {
  CommanderAttemptRecord,
  CommanderPlan,
  CommanderRunRecord,
  CommanderRunStatus,
} from "./types";
import {
  loadCommanderRunsFromClerk,
  persistCommanderRunToClerk,
  snapshotToCommanderRun,
} from "./durable-store";

const DATA_DIR = path.join(process.cwd(), ".data", "commander");
const RUNS_FILE = path.join(DATA_DIR, "runs.json");

type RunsFileShape = {
  version: 1;
  runs: Record<string, CommanderRunRecord>;
};

type RunBucket = Map<string, CommanderRunRecord>;

function getHydratedUsers(): Set<string> {
  const scope = globalThis as typeof globalThis & {
    __atlasCommanderHydratedUsers?: Set<string>;
  };
  if (!scope.__atlasCommanderHydratedUsers) {
    scope.__atlasCommanderHydratedUsers = new Set();
  }
  return scope.__atlasCommanderHydratedUsers;
}

function getBucket(): RunBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasCommanderRunStore?: RunBucket;
  };
  if (!scope.__atlasCommanderRunStore) {
    scope.__atlasCommanderRunStore = loadFromDisk();
  }
  return scope.__atlasCommanderRunStore;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFromDisk(): RunBucket {
  try {
    if (!existsSync(RUNS_FILE)) return new Map();
    const raw = readFileSync(RUNS_FILE, "utf8");
    const parsed = JSON.parse(raw) as RunsFileShape;
    if (!parsed?.runs || typeof parsed.runs !== "object") return new Map();
    return new Map(Object.entries(parsed.runs));
  } catch {
    return new Map();
  }
}

/** Local/dev cache only — production durability is Clerk (+ optional Supabase). */
function persistLocalCache(bucket: RunBucket): void {
  try {
    ensureDataDir();
    const sorted = [...bucket.entries()].sort(
      (a, b) =>
        new Date(b[1].updatedAt).getTime() - new Date(a[1].updatedAt).getTime(),
    );
    const trimmed = sorted.slice(0, 500);
    const payload: RunsFileShape = {
      version: 1,
      runs: Object.fromEntries(trimmed),
    };
    writeFileSync(RUNS_FILE, JSON.stringify(payload), "utf8");
    bucket.clear();
    for (const [id, run] of trimmed) bucket.set(id, run);
  } catch {
    // Non-fatal on serverless read-only filesystems.
  }
}

function persistDurable(run: CommanderRunRecord): void {
  persistLocalCache(getBucket());
  void persistCommanderRunToClerk(run);
}

export function createCommanderRun(input: {
  userId: string;
  assignment: string;
  plan: CommanderPlan;
  status?: CommanderRunStatus;
  confirmationReasons?: string[];
}): CommanderRunRecord {
  const now = new Date().toISOString();
  const record: CommanderRunRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    assignment: input.assignment,
    status: input.status ?? "planning",
    plan: input.plan,
    confirmationReasons: input.confirmationReasons ?? [],
    attempts: [],
    result: null,
    error: null,
    workflowRunId: null,
    cancelRequested: false,
    createdAt: now,
    updatedAt: now,
  };
  getBucket().set(record.id, record);
  persistDurable(record);
  return record;
}

export function getCommanderRun(
  runId: string,
  userId: string,
): CommanderRunRecord | null {
  const run = getBucket().get(runId) ?? null;
  if (!run) return null;
  if (run.userId !== userId) return null;
  return run;
}

/** Hydrate durable Clerk/Supabase snapshots into the hot memory bucket. */
export async function ensureCommanderRunsHydrated(userId: string): Promise<void> {
  if (getHydratedUsers().has(userId)) return;
  getHydratedUsers().add(userId);

  const hasUserRuns = [...getBucket().values()].some((run) => run.userId === userId);
  if (hasUserRuns) return;

  const snapshots = await loadCommanderRunsFromClerk(userId);
  const bucket = getBucket();
  for (const snapshot of snapshots) {
    if (bucket.has(snapshot.id)) continue;
    bucket.set(snapshot.id, snapshotToCommanderRun(snapshot));
  }
  persistLocalCache(bucket);
}

export function listCommanderRunsForUser(
  userId: string,
  limit = 20,
): CommanderRunRecord[] {
  return [...getBucket().values()]
    .filter((run) => run.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, limit);
}

export function updateCommanderRun(
  runId: string,
  userId: string,
  patch: Partial<
    Pick<
      CommanderRunRecord,
      | "status"
      | "plan"
      | "confirmationReasons"
      | "attempts"
      | "result"
      | "error"
      | "workflowRunId"
      | "cancelRequested"
    >
  >,
): CommanderRunRecord | null {
  const existing = getCommanderRun(runId, userId);
  if (!existing) return null;
  const updated: CommanderRunRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  getBucket().set(runId, updated);
  persistDurable(updated);
  return updated;
}

export function appendCommanderAttempt(
  runId: string,
  userId: string,
  attempt: CommanderAttemptRecord,
): CommanderRunRecord | null {
  const existing = getCommanderRun(runId, userId);
  if (!existing) return null;
  return updateCommanderRun(runId, userId, {
    attempts: [...existing.attempts, attempt],
  });
}

export function requestCommanderCancel(
  runId: string,
  userId: string,
): CommanderRunRecord | null {
  const existing = getCommanderRun(runId, userId);
  if (!existing) return null;
  if (
    existing.status === "completed" ||
    existing.status === "failed" ||
    existing.status === "cancelled"
  ) {
    return existing;
  }
  return updateCommanderRun(runId, userId, {
    cancelRequested: true,
    status:
      existing.status === "running" || existing.status === "planning"
        ? "cancelled"
        : existing.status === "awaiting_confirmation"
          ? "cancelled"
          : existing.status,
  });
}

export function isCommanderCancelRequested(
  runId: string,
  userId: string,
): boolean {
  return Boolean(getCommanderRun(runId, userId)?.cancelRequested);
}

export function resetCommanderRunStoreForTests(): void {
  const bucket = getBucket();
  bucket.clear();
  getHydratedUsers().clear();
  try {
    if (existsSync(RUNS_FILE)) {
      writeFileSync(RUNS_FILE, JSON.stringify({ version: 1, runs: {} }), "utf8");
    }
  } catch {
    // ignore
  }
}

/** Remove all commander runs for one user (account purge). */
export function clearCommanderRunsForUser(userId: string): number {
  const bucket = getBucket();
  let removed = 0;
  for (const [id, run] of [...bucket.entries()]) {
    if (run.userId === userId) {
      bucket.delete(id);
      removed += 1;
    }
  }
  if (removed > 0) {
    persistLocalCache(bucket);
  }
  getHydratedUsers().delete(userId);
  return removed;
}

export type { CommanderRunRecord };
