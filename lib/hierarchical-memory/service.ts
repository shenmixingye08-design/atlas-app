import "server-only";

import { randomUUID } from "crypto";

import { ensureHierarchicalMemoryHydrated, schedulePersistHierarchicalMemory } from "./durable";
import { extractSaveCandidatesFromAssignment } from "./extract";
import { assessMissingInfo } from "./missing-info";
import {
  buildHierarchicalMemoryMetadata,
  resolveHierarchicalMemories,
} from "./resolve";
import { assertSafeMemoryContent, sanitizeMemoryValue } from "./security";
import {
  listStoredHierarchicalMemories,
  replaceStoredHierarchicalMemories,
  upsertStoredHierarchicalMemory,
} from "./store";
import type {
  HierarchicalMemoryRecord,
  MemoryResolveContext,
  MemoryScope,
  MissingInfoAssessment,
  ResolvedMemoryBundle,
  SaveCandidate,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function scopeKey(record: Pick<HierarchicalMemoryRecord, "scope" | "key" | "projectId" | "jobId" | "automationId">): string {
  return [
    record.scope,
    record.key,
    record.projectId ?? "",
    record.jobId ?? "",
    record.automationId ?? "",
  ].join(":");
}

export async function hydrateHierarchicalMemory(userId: string): Promise<void> {
  await ensureHierarchicalMemoryHydrated(userId);
}

export function listHierarchicalMemories(
  userId: string,
  filters?: { scope?: MemoryScope | "all"; includeInactive?: boolean },
): HierarchicalMemoryRecord[] {
  return listStoredHierarchicalMemories(userId).filter((memory) => {
    if (filters?.scope && filters.scope !== "all" && memory.scope !== filters.scope) {
      return false;
    }
    if (!filters?.includeInactive && memory.status !== "active") return false;
    return true;
  });
}

export function saveHierarchicalMemory(
  userId: string,
  candidate: SaveCandidate,
): HierarchicalMemoryRecord {
  assertSafeMemoryContent(candidate.value);
  const value = sanitizeMemoryValue(candidate.value);
  const existing = listStoredHierarchicalMemories(userId).find(
    (memory) =>
      memory.status === "active" &&
      scopeKey(memory) ===
        scopeKey({
          scope: candidate.scope,
          key: candidate.key,
          projectId: candidate.projectId ?? null,
          jobId: candidate.jobId ?? null,
          automationId: candidate.automationId ?? null,
        }),
  );

  if (existing && existing.value === value) {
    return existing; // dedupe identical
  }

  if (existing) {
    upsertStoredHierarchicalMemory({
      ...existing,
      status: "superseded",
      updatedAt: nowIso(),
    });
  }

  const record: HierarchicalMemoryRecord = {
    id: randomUUID(),
    userId,
    scope: candidate.scope,
    projectId: candidate.projectId ?? null,
    jobId: candidate.jobId ?? null,
    automationId: candidate.automationId ?? null,
    category: candidate.category,
    key: candidate.key,
    value,
    source: candidate.source,
    confidence: candidate.confidence,
    priority: candidate.source === "explicit_user_instruction" ? 80 : 40,
    isTemporary: candidate.isTemporary,
    expiresAt: candidate.expiresAt,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastUsedAt: null,
    useCount: 0,
    status: "active",
  };
  upsertStoredHierarchicalMemory(record);
  schedulePersistHierarchicalMemory(userId);
  return record;
}

export function updateHierarchicalMemory(
  userId: string,
  id: string,
  patch: Partial<
    Pick<
      HierarchicalMemoryRecord,
      "value" | "scope" | "status" | "isTemporary" | "category" | "key"
    >
  >,
): HierarchicalMemoryRecord | null {
  const current = listStoredHierarchicalMemories(userId).find(
    (memory) => memory.id === id && memory.userId === userId,
  );
  if (!current) return null;
  if (patch.value != null) assertSafeMemoryContent(patch.value);
  const next: HierarchicalMemoryRecord = {
    ...current,
    ...patch,
    value: patch.value != null ? sanitizeMemoryValue(patch.value) : current.value,
    updatedAt: nowIso(),
  };
  upsertStoredHierarchicalMemory(next);
  schedulePersistHierarchicalMemory(userId);
  return next;
}

export function deleteHierarchicalMemory(userId: string, id: string): boolean {
  const current = listStoredHierarchicalMemories(userId).find(
    (memory) => memory.id === id && memory.userId === userId,
  );
  if (!current) return false;
  upsertStoredHierarchicalMemory({
    ...current,
    status: "deleted",
    updatedAt: nowIso(),
  });
  schedulePersistHierarchicalMemory(userId);
  return true;
}

export function markHierarchicalMemoriesUsed(
  userId: string,
  ids: string[],
): void {
  if (ids.length === 0) return;
  const set = new Set(ids);
  const next = listStoredHierarchicalMemories(userId).map((memory) =>
    set.has(memory.id)
      ? {
          ...memory,
          useCount: memory.useCount + 1,
          lastUsedAt: nowIso(),
          updatedAt: nowIso(),
        }
      : memory,
  );
  replaceStoredHierarchicalMemories(userId, next);
  schedulePersistHierarchicalMemory(userId);
}

export function learnFromAssignment(context: MemoryResolveContext): HierarchicalMemoryRecord[] {
  const candidates = extractSaveCandidatesFromAssignment(context);
  // Temporary ("今日だけ") → save as conversation/temporary only
  // Explicit permanent → auto-save (safe settings)
  return candidates.map((candidate) =>
    saveHierarchicalMemory(context.userId, candidate),
  );
}

export function prepareMemoryForGeneration(context: MemoryResolveContext): {
  bundle: ResolvedMemoryBundle;
  missing: MissingInfoAssessment;
  metadata: Record<string, string>;
  savedFromAssignment: HierarchicalMemoryRecord[];
} {
  const savedFromAssignment = learnFromAssignment(context);
  const bundle = resolveHierarchicalMemories(context);
  if (bundle.usedIds.length > 0) {
    markHierarchicalMemoriesUsed(context.userId, bundle.usedIds);
  }
  const missing = assessMissingInfo({
    assignment: context.assignment,
    resolved: bundle,
  });
  const meta = buildHierarchicalMemoryMetadata(bundle) ?? {};
  if (missing.assumptions.length > 0) {
    meta.memoryAssumptions = missing.assumptions.join(" / ");
  }
  if (!missing.canProceed) {
    meta.missingInfoCritical = JSON.stringify(missing.questions);
  }
  return {
    bundle,
    missing,
    metadata: meta,
    savedFromAssignment,
  };
}

export {
  resolveHierarchicalMemories,
  buildHierarchicalMemoryMetadata,
  readHierarchicalMemoryFromMetadata,
} from "./resolve";
export { assessMissingInfo } from "./missing-info";
export { extractSaveCandidatesFromAssignment } from "./extract";
