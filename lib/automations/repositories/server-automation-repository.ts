import "server-only";

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

import type { AutomationRepository } from "./types";

type AutomationBucket = Map<string, Automation>;

function getBucket(): AutomationBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationStore?: AutomationBucket;
  };

  if (!globalScope.__atlasAutomationStore) {
    globalScope.__atlasAutomationStore = new Map(
      SEED_AUTOMATIONS.map((automation) => [automation.id, automation]),
    );
  }

  return globalScope.__atlasAutomationStore;
}

function matchesFilter(automation: Automation, filter?: AutomationFilter): boolean {
  if (!filter) return true;

  if (filter.enabled !== undefined && automation.enabled !== filter.enabled) {
    return false;
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

function withDefaults(automation: Automation): Automation {
  return {
    ...automation,
    timing: automation.timing ?? DEFAULT_AUTOMATION_TIMING,
    executionLevel: normalizeExecutionLevel(automation.executionLevel),
    executionMode: normalizeExecutionMode(automation.executionMode),
    snsBatchDays: normalizeSnsBatchDays(automation.snsBatchDays),
    executionFlow: normalizeExecutionFlow(automation.executionFlow),
  };
}

/** Server-side in-memory automation store (seeded, survives warm reloads). */
export class ServerAutomationRepository implements AutomationRepository {
  async list(filter?: AutomationFilter): Promise<Automation[]> {
    const items = [...getBucket().values()]
      .map(withDefaults)
      .filter((item) => matchesFilter(item, filter));
    return items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async findById(id: string): Promise<Automation | null> {
    const item = getBucket().get(id);
    return item ? withDefaults(item) : null;
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

    getBucket().set(id, updated);
    return updated;
  }

  async saveAll(automations: Automation[]): Promise<void> {
    const bucket = getBucket();
    bucket.clear();
    for (const automation of automations) {
      bucket.set(automation.id, automation);
    }
  }
}

export const serverAutomationRepository = new ServerAutomationRepository();
