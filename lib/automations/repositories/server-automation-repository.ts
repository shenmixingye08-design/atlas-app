import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import { SEED_AUTOMATIONS } from "../domain";
import type {
  Automation,
  AutomationFilter,
  CreateAutomationInput,
  UpdateAutomationInput,
} from "../types";
import { createAutomationFromInput } from "../domain";
import { computeNextRunIso } from "../schedule";
import { normalizeExecutionLevel } from "../execution-level";
import { normalizeExecutionMode } from "@/lib/cost-optimization/execution-mode";
import { normalizeSnsBatchDays } from "@/lib/cost-optimization/sns-batch";
import { normalizeExecutionFlow } from "../execution-flow";
import { DEFAULT_AUTOMATION_TIMING } from "../timing-defaults";
import { normalizeRunHistory } from "../normalize-run-history";
import { isActiveExecutionStatus } from "../execution-status";

import type { AutomationRepository } from "./types";

type AutomationBucket = Map<string, Automation>;

const STUCK_RUNNING_MS = 1000 * 60 * 30;
const MAX_RUN_HISTORY = 20;

function getBucket(): AutomationBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationStore?: AutomationBucket;
  };

  if (!globalScope.__atlasAutomationStore) {
    // Production starts empty — durable hydrate restores user state.
    // Local/dev may optionally seed demo habits for UX previews.
    const shouldSeed =
      !isAtlasProduction() && process.env.ATLAS_SEED_AUTOMATIONS !== "0";
    globalScope.__atlasAutomationStore = new Map(
      shouldSeed
        ? SEED_AUTOMATIONS.map((automation) => [automation.id, automation])
        : [],
    );
  }

  return globalScope.__atlasAutomationStore;
}

function getHydratedUsers(): Set<string> {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationHydratedUsers?: Set<string>;
  };
  if (!globalScope.__atlasAutomationHydratedUsers) {
    globalScope.__atlasAutomationHydratedUsers = new Set();
  }
  return globalScope.__atlasAutomationHydratedUsers;
}

function matchesFilter(automation: Automation, filter?: AutomationFilter): boolean {
  if (!filter) return true;

  if (filter.enabled !== undefined && automation.enabled !== filter.enabled) {
    return false;
  }

  if (filter.userId !== undefined) {
    if (filter.userId === null) {
      if (automation.userId !== null) return false;
    } else if (automation.userId !== filter.userId) {
      return false;
    }
  }

  if (filter.ids && !filter.ids.includes(automation.id)) {
    return false;
  }

  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    if (!statuses.includes(automation.status)) return false;
  }

  return true;
}

export function withAutomationDefaults(automation: Automation): Automation {
  const successCount = Math.max(0, automation.successCount ?? 0);
  const failureCount = Math.max(0, automation.failureCount ?? 0);
  const runHistory = normalizeRunHistory(automation.runHistory, MAX_RUN_HISTORY);

  let status = automation.status;
  if (isActiveExecutionStatus(status)) {
    const updatedAt = new Date(automation.updatedAt).getTime();
    if (
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt > STUCK_RUNNING_MS
    ) {
      status = "failed";
    }
  }

  return {
    ...automation,
    userId: automation.userId ?? null,
    timing: automation.timing ?? DEFAULT_AUTOMATION_TIMING,
    executionLevel: normalizeExecutionLevel(automation.executionLevel),
    executionMode: normalizeExecutionMode(automation.executionMode),
    snsBatchDays: normalizeSnsBatchDays(automation.snsBatchDays),
    executionFlow: normalizeExecutionFlow(automation.executionFlow),
    successCount,
    failureCount,
    runHistory,
    status,
    lastResultSummary: automation.lastResultSummary ?? null,
    currentAttempt: Math.max(0, automation.currentAttempt ?? 0),
    nextRetryAt: automation.nextRetryAt ?? null,
    activeSlotKey: automation.activeSlotKey ?? null,
    lastError:
      status === "failed" && !automation.lastError
        ? "実行がタイムアウトした可能性があります"
        : automation.lastError,
  };
}

/** Server-side automation cache (hydrated from Clerk/Supabase durable state). */
export class ServerAutomationRepository implements AutomationRepository {
  async list(filter?: AutomationFilter): Promise<Automation[]> {
    const items = [...getBucket().values()]
      .map(withAutomationDefaults)
      .filter((item) => matchesFilter(item, filter));
    return items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async findById(id: string): Promise<Automation | null> {
    const item = getBucket().get(id);
    return item ? withAutomationDefaults(item) : null;
  }

  async create(input: CreateAutomationInput): Promise<Automation> {
    const automation = createAutomationFromInput(input);
    getBucket().set(automation.id, automation);
    return automation;
  }

  async update(
    id: string,
    patch: UpdateAutomationInput,
  ): Promise<Automation | null> {
    const existing = getBucket().get(id);
    if (!existing) return null;

    const updated: Automation = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    if (patch.schedule) {
      updated.nextRun = computeNextRunIso(updated.schedule);
    }

    if (patch.enabled === false && updated.status !== "running") {
      updated.status = "idle";
    }

    if (Array.isArray(updated.runHistory)) {
      updated.runHistory = updated.runHistory.slice(0, MAX_RUN_HISTORY);
    }

    getBucket().set(id, updated);
    return withAutomationDefaults(updated);
  }

  async saveAll(automations: Automation[]): Promise<void> {
    const bucket = getBucket();
    bucket.clear();
    for (const automation of automations) {
      bucket.set(automation.id, withAutomationDefaults(automation));
    }
  }

  async replaceUserAutomations(
    userId: string,
    automations: Automation[],
  ): Promise<void> {
    const bucket = getBucket();
    for (const [id, row] of [...bucket.entries()]) {
      if (row.userId === userId) bucket.delete(id);
    }
    for (const automation of automations) {
      bucket.set(
        automation.id,
        withAutomationDefaults({ ...automation, userId }),
      );
    }
  }
}

export function isAutomationsHydrated(userId: string): boolean {
  return getHydratedUsers().has(userId);
}

export function markAutomationsHydrated(userId: string): void {
  getHydratedUsers().add(userId);
}

export function listStoredAutomationsForUser(userId: string): Automation[] {
  return [...getBucket().values()]
    .map(withAutomationDefaults)
    .filter((row) => row.userId === userId);
}

export function resetAutomationStore(options?: { seed?: boolean }): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationStore?: AutomationBucket;
    __atlasAutomationHydratedUsers?: Set<string>;
  };
  const seed = options?.seed === true;
  globalScope.__atlasAutomationStore = new Map(
    seed
      ? SEED_AUTOMATIONS.map((automation) => [automation.id, automation])
      : [],
  );
  globalScope.__atlasAutomationHydratedUsers = new Set();
}

export const MAX_AUTOMATION_RUN_HISTORY = MAX_RUN_HISTORY;

export const serverAutomationRepository = new ServerAutomationRepository();
