import "server-only";

import { randomUUID } from "crypto";

import {
  evaluateCorrectionForCandidate,
  fingerprintCorrection,
} from "@/lib/personal-memory/candidates";
import {
  ensurePersonalMemoryHydrated,
  schedulePersistPersonalMemory,
  wipePersonalMemoryDurable,
} from "@/lib/personal-memory/durable";
import { kindForScope } from "@/lib/personal-memory/scopes";
import {
  assertNoSecretsInValue,
  redactForLog,
  resolveSensitivity,
  sanitizeUserFacingMemoryText,
} from "@/lib/personal-memory/security";
import { computeExpiresAt, isExpired, isStaleUnused } from "@/lib/personal-memory/retention";
import {
  resolvePersonalMemories,
  toRunMemoryLedger,
  type ResolveMemoryInput,
} from "@/lib/personal-memory/resolve";
import {
  clearAllPersonalMemoryData,
  deleteStoredPersonalMemory,
  findStoredPersonalMemory,
  listStoredPersonalMemories,
  markRejectedFingerprint,
  readPersonalMemorySettings,
  upsertStoredPersonalMemory,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import type {
  CorrectionSignal,
  CreatePersonalMemoryInput,
  MemoryStatus,
  PersonalMemoryRecord,
  PersonalMemorySettings,
  RunMemoryLedger,
  UpdatePersonalMemoryInput,
} from "@/lib/personal-memory/types";
import {
  DEFAULT_PERSONAL_MEMORY_SETTINGS,
  MAX_CANDIDATES_PER_USER,
  MAX_PERSONAL_MEMORIES_PER_USER,
} from "@/lib/personal-memory/types";
import { appendPersonalMemoryAudit } from "@/lib/personal-memory/audit";

function nowIso(): string {
  return new Date().toISOString();
}

function clampConfidence(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0.7;
  return Math.min(1, Math.max(0.1, value));
}

function assertOwner(
  record: PersonalMemoryRecord | null,
  userId: string,
): PersonalMemoryRecord {
  if (!record || record.userId !== userId) {
    throw new Error("MEMORY_NOT_FOUND");
  }
  return record;
}

function trimBuckets(userId: string): void {
  const all = listStoredPersonalMemories(userId);
  const candidates = all.filter((m) => m.status === "candidate");
  if (candidates.length > MAX_CANDIDATES_PER_USER) {
    for (const row of candidates.slice(MAX_CANDIDATES_PER_USER)) {
      deleteStoredPersonalMemory(userId, row.id);
    }
  }
  const active = all.filter((m) => m.status === "active" || m.status === "paused");
  if (active.length > MAX_PERSONAL_MEMORIES_PER_USER) {
    const removable = [...active]
      .sort((a, b) => a.confidence - b.confidence)
      .slice(0, active.length - MAX_PERSONAL_MEMORIES_PER_USER);
    for (const row of removable) {
      softDeleteMemory(userId, row.id);
    }
  }
}

export async function getPersonalMemorySettings(
  userId: string,
): Promise<PersonalMemorySettings> {
  await ensurePersonalMemoryHydrated(userId);
  return readPersonalMemorySettings(userId);
}

export async function updatePersonalMemorySettings(
  userId: string,
  patch: Partial<PersonalMemorySettings> & {
    /** When disabling: keep | wipe */
    onDisable?: "keep" | "wipe";
  },
): Promise<PersonalMemorySettings> {
  await ensurePersonalMemoryHydrated(userId);
  const current = readPersonalMemorySettings(userId);
  const next = writePersonalMemorySettings(userId, {
    ...current,
    ...patch,
  });

  if (patch.enabled === false && patch.onDisable === "wipe") {
    await deleteAllPersonalMemories(userId);
  }

  // When disabled, pause utilization is handled in resolve; no forced status change.
  schedulePersistPersonalMemory(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "settings.update",
    memoryId: null,
    meta: { enabled: next.enabled },
  });
  return next;
}

export async function listPersonalMemories(
  userId: string,
  filter?: { status?: MemoryStatus | "all" },
): Promise<PersonalMemoryRecord[]> {
  await ensurePersonalMemoryHydrated(userId);
  const settings = readPersonalMemorySettings(userId);
  const now = Date.now();
  let rows = listStoredPersonalMemories(userId).map((row) => {
    if (row.status === "active" && isExpired(row.expiresAt, now)) {
      const expired = {
        ...row,
        status: "expired" as const,
        updatedAt: nowIso(),
      };
      upsertStoredPersonalMemory(expired);
      return expired;
    }
    return row;
  });

  // Mark stale unused as needing reconfirm — leave active but expose via filter later
  rows = rows.map((row) => {
    if (
      row.status === "active" &&
      isStaleUnused({
        lastUsedAt: row.lastUsedAt,
        createdAt: row.createdAt,
        unusedReconfirmDays: settings.unusedReconfirmDays,
        nowMs: now,
      })
    ) {
      return row;
    }
    return row;
  });

  if (filter?.status && filter.status !== "all") {
    rows = rows.filter((row) => row.status === filter.status);
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPersonalMemory(
  userId: string,
  id: string,
): Promise<PersonalMemoryRecord> {
  await ensurePersonalMemoryHydrated(userId);
  return assertOwner(findStoredPersonalMemory(userId, id), userId);
}

export async function createPersonalMemory(
  userId: string,
  input: CreatePersonalMemoryInput,
): Promise<PersonalMemoryRecord> {
  await ensurePersonalMemoryHydrated(userId);
  const settings = readPersonalMemorySettings(userId);

  if (!settings.enabled && input.status !== "candidate") {
    throw new Error("MEMORY_DISABLED");
  }

  assertNoSecretsInValue(input.value);
  const sensitivity =
    input.sensitivity ?? resolveSensitivity(input.scope, input.value);

  if (
    settings.blockSensitiveStorage &&
    (sensitivity === "sensitive" || sensitivity === "restricted")
  ) {
    throw new Error("SENSITIVE_STORAGE_BLOCKED");
  }

  // Inferences must never start as active
  const requestedStatus = input.status ?? "candidate";
  const isInference =
    input.source === "system_inference" ||
    input.source === "user_correction" ||
    input.source === "correction" ||
    input.source === "approved_inference" ||
    input.source === "automation_result";
  if (isInference && requestedStatus === "active" && input.source !== "approved_inference") {
    throw new Error("INFERENCE_CANNOT_AUTO_ACTIVATE");
  }
  if (input.source === "external_content") {
    throw new Error("EXTERNAL_CONTENT_BLOCKED");
  }

  const status: MemoryStatus =
    input.source === "explicit" || input.source === "user_explicit"
      ? requestedStatus === "candidate"
        ? "candidate"
        : "active"
      : requestedStatus === "active" && input.source === "approved_inference"
        ? "active"
        : "candidate";

  const expiresAt =
    input.expiresAt !== undefined
      ? input.expiresAt
      : computeExpiresAt(input.retention ?? settings.defaultRetention);

  const now = nowIso();
  const record: PersonalMemoryRecord = {
    id: randomUUID(),
    userId,
    kind: input.kind || kindForScope(input.scope),
    scope: input.scope,
    key: input.key,
    value: input.value,
    title: sanitizeUserFacingMemoryText(input.title).slice(0, 120),
    summary: sanitizeUserFacingMemoryText(input.summary).slice(0, 400),
    source: input.source,
    confidence: clampConfidence(input.confidence),
    status,
    sensitivity,
    appliesTo: {
      global: input.appliesTo?.global ?? true,
      automationIds: input.appliesTo?.automationIds ?? [],
      artifactTypes: input.appliesTo?.artifactTypes ?? [],
      capabilities: input.appliesTo?.capabilities ?? [],
    },
    evidence: input.evidence ?? [
      {
        kind: "manual",
        summary: "手動で保存",
        occurredAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    expiresAt,
    rejectedReason: null,
    deletedAt: null,
  };

  upsertStoredPersonalMemory(record);
  trimBuckets(userId);
  schedulePersistPersonalMemory(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "memory.create",
    memoryId: record.id,
    meta: redactForLog(record),
  });
  return record;
}

export async function updatePersonalMemory(
  userId: string,
  id: string,
  patch: UpdatePersonalMemoryInput,
): Promise<PersonalMemoryRecord> {
  await ensurePersonalMemoryHydrated(userId);
  const current = assertOwner(findStoredPersonalMemory(userId, id), userId);
  if (patch.value) assertNoSecretsInValue(patch.value);

  const next: PersonalMemoryRecord = {
    ...current,
    ...patch,
    value: patch.value ?? current.value,
    sensitivity:
      patch.sensitivity ??
      (patch.value
        ? resolveSensitivity(current.scope, patch.value)
        : current.sensitivity),
    updatedAt: nowIso(),
  };
  upsertStoredPersonalMemory(next);
  schedulePersistPersonalMemory(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "memory.update",
    memoryId: id,
    meta: { status: next.status },
  });
  return next;
}

function softDeleteMemory(userId: string, id: string): PersonalMemoryRecord | null {
  const current = findStoredPersonalMemory(userId, id);
  if (!current || current.userId !== userId) return null;
  const next: PersonalMemoryRecord = {
    ...current,
    status: "deleted",
    deletedAt: nowIso(),
    updatedAt: nowIso(),
  };
  upsertStoredPersonalMemory(next);
  return next;
}

export async function deletePersonalMemory(
  userId: string,
  id: string,
): Promise<void> {
  await ensurePersonalMemoryHydrated(userId);
  const current = assertOwner(findStoredPersonalMemory(userId, id), userId);
  try {
    const { recordMemoryVersion } = await import(
      "@/lib/personal-memory/versioning"
    );
    recordMemoryVersion({
      memoryId: id,
      userId,
      action: "deleted",
      snapshot: current,
      approvedBy: userId,
    });
  } catch {
    // optional
  }
  softDeleteMemory(userId, id);
  schedulePersistPersonalMemory(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "memory.delete",
    memoryId: id,
    meta: {},
  });
}

/** Undo last delete/pause by restoring snapshot. */
export async function undoPersonalMemoryChange(
  userId: string,
  memoryId: string,
): Promise<PersonalMemoryRecord | null> {
  await ensurePersonalMemoryHydrated(userId);
  const { findUndoSnapshot, recordMemoryVersion } = await import(
    "@/lib/personal-memory/versioning"
  );
  const snapshot = findUndoSnapshot({ userId, memoryId });
  if (!snapshot || snapshot.userId !== userId) return null;
  const restored: PersonalMemoryRecord = {
    ...snapshot,
    status: snapshot.status === "deleted" ? "active" : snapshot.status,
    deletedAt: null,
    updatedAt: nowIso(),
  };
  upsertStoredPersonalMemory(restored);
  schedulePersistPersonalMemory(userId);
  recordMemoryVersion({
    memoryId,
    userId,
    action: "undo",
    snapshot: restored,
    approvedBy: userId,
  });
  appendPersonalMemoryAudit({
    userId,
    action: "memory.update",
    memoryId,
    meta: { undo: true },
  });
  return restored;
}

export async function deleteAllPersonalMemories(userId: string): Promise<number> {
  await ensurePersonalMemoryHydrated(userId);
  const rows = listStoredPersonalMemories(userId);
  for (const row of rows) {
    softDeleteMemory(userId, row.id);
  }
  schedulePersistPersonalMemory(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "memory.delete_all",
    memoryId: null,
    meta: { count: rows.length },
  });
  return rows.length;
}

export async function pausePersonalMemory(
  userId: string,
  id: string,
): Promise<PersonalMemoryRecord> {
  return updatePersonalMemory(userId, id, { status: "paused" });
}

export async function activatePersonalMemory(
  userId: string,
  id: string,
): Promise<PersonalMemoryRecord> {
  return updatePersonalMemory(userId, id, { status: "active" });
}

export async function approveCandidate(
  userId: string,
  id: string,
  options?: {
    scope?: "global" | "automation" | "once";
    automationId?: string | null;
  },
): Promise<PersonalMemoryRecord> {
  await ensurePersonalMemoryHydrated(userId);
  const current = assertOwner(findStoredPersonalMemory(userId, id), userId);
  if (current.status !== "candidate") {
    throw new Error("NOT_A_CANDIDATE");
  }

  const scopeMode = options?.scope ?? "global";
  const appliesTo =
    scopeMode === "global"
      ? { ...current.appliesTo, global: true }
      : {
          ...current.appliesTo,
          global: false,
          automationIds: options?.automationId
            ? [options.automationId]
            : current.appliesTo.automationIds,
        };

  const approved: PersonalMemoryRecord = {
    ...current,
    status: "active",
    source: "approved_inference",
    confidence: Math.max(current.confidence, 0.9),
    appliesTo,
    expiresAt:
      scopeMode === "once" ? computeExpiresAt("once") : current.expiresAt,
    updatedAt: nowIso(),
  };
  upsertStoredPersonalMemory(approved);
  schedulePersistPersonalMemory(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "candidate.approve",
    memoryId: id,
    meta: { scope: scopeMode },
  });
  try {
    const { recordMemoryVersion } = await import(
      "@/lib/personal-memory/versioning"
    );
    recordMemoryVersion({
      memoryId: id,
      userId,
      action: "approved",
      snapshot: approved,
      approvedBy: userId,
    });
  } catch {
    // optional
  }
  return approved;
}

export async function rejectCandidate(
  userId: string,
  id: string,
  reason?: string,
): Promise<PersonalMemoryRecord> {
  await ensurePersonalMemoryHydrated(userId);
  const current = assertOwner(findStoredPersonalMemory(userId, id), userId);
  if (current.status !== "candidate") {
    throw new Error("NOT_A_CANDIDATE");
  }
  const fingerprint = fingerprintCorrection({
    text: `${current.scope}:${current.key}:${JSON.stringify(current.value)}`,
    scope: current.scope,
    automationId: current.appliesTo.automationIds[0] ?? null,
  });
  markRejectedFingerprint(userId, fingerprint);
  const rejected: PersonalMemoryRecord = {
    ...current,
    status: "rejected",
    rejectedReason: reason ?? "user_rejected",
    updatedAt: nowIso(),
  };
  upsertStoredPersonalMemory(rejected);
  schedulePersistPersonalMemory(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "candidate.reject",
    memoryId: id,
    meta: {},
  });
  return rejected;
}

export async function pauseAllPersonalMemories(userId: string): Promise<number> {
  await ensurePersonalMemoryHydrated(userId);
  const rows = listStoredPersonalMemories(userId).filter((m) => m.status === "active");
  for (const row of rows) {
    upsertStoredPersonalMemory({
      ...row,
      status: "paused",
      updatedAt: nowIso(),
    });
  }
  schedulePersistPersonalMemory(userId);
  return rows.length;
}

export async function exportPersonalMemories(userId: string): Promise<{
  exportedAt: string;
  settings: PersonalMemorySettings;
  memories: PersonalMemoryRecord[];
}> {
  await ensurePersonalMemoryHydrated(userId);
  const memories = listStoredPersonalMemories(userId).filter(
    (m) => m.status !== "deleted",
  );
  appendPersonalMemoryAudit({
    userId,
    action: "memory.export",
    memoryId: null,
    meta: { count: memories.length },
  });
  return {
    exportedAt: nowIso(),
    settings: readPersonalMemorySettings(userId),
    memories,
  };
}

export async function ingestCorrectionSignal(
  signal: CorrectionSignal,
): Promise<PersonalMemoryRecord | null> {
  await ensurePersonalMemoryHydrated(signal.userId);
  const evaluated = evaluateCorrectionForCandidate(signal);
  if (evaluated.action === "none" || !evaluated.input) return null;

  // Avoid duplicate open candidates with same scope+key+summary
  const existing = listStoredPersonalMemories(signal.userId).find(
    (m) =>
      m.status === "candidate" &&
      m.scope === evaluated.input!.scope &&
      m.key === evaluated.input!.key &&
      m.summary === evaluated.input!.summary,
  );
  if (existing) return existing;

  return createPersonalMemory(signal.userId, evaluated.input);
}

export async function resolveForContext(
  input: Omit<ResolveMemoryInput, "settings" | "memories"> & {
    userId: string;
  },
): Promise<{ result: ReturnType<typeof resolvePersonalMemories>; ledger: RunMemoryLedger }> {
  await ensurePersonalMemoryHydrated(input.userId);
  const settings = readPersonalMemorySettings(input.userId);
  const memories = listStoredPersonalMemories(input.userId);
  const result = resolvePersonalMemories({
    ...input,
    settings,
    memories,
  });

  // Touch lastUsedAt for used memories
  const now = nowIso();
  for (const used of result.used) {
    if (used.memoryId.startsWith("override:")) continue;
    const row = findStoredPersonalMemory(input.userId, used.memoryId);
    if (!row) continue;
    upsertStoredPersonalMemory({
      ...row,
      lastUsedAt: now,
      updatedAt: row.updatedAt,
    });
  }
  if (result.used.length > 0) {
    schedulePersistPersonalMemory(input.userId);
  }

  return { result, ledger: toRunMemoryLedger(result) };
}

export async function wipePersonalMemoryForAccountDeletion(
  userId: string,
): Promise<void> {
  await ensurePersonalMemoryHydrated(userId);
  clearAllPersonalMemoryData(userId);
  wipePersonalMemoryDurable(userId);
  writePersonalMemorySettings(userId, DEFAULT_PERSONAL_MEMORY_SETTINGS);
  appendPersonalMemoryAudit({
    userId,
    action: "memory.account_wipe",
    memoryId: null,
    meta: {},
  });
}
