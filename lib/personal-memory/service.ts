import "server-only";

import { randomUUID } from "crypto";

import {
  evaluateCorrectionForCandidate,
  fingerprintCorrection,
  isUnambiguousStylePreference,
} from "@/lib/personal-memory/candidates";
import {
  ensurePersonalMemoryHydrated,
  persistPersonalMemoryNow,
  PersonalMemoryHydrationError,
  schedulePersistPersonalMemory,
  wipePersonalMemoryDurable,
} from "@/lib/personal-memory/durable";
import { personalMemoryError } from "@/lib/personal-memory/errors";
import {
  measureEditDiff,
  preferenceTextFromEditDiff,
  shouldProposeEditCandidate,
} from "@/lib/personal-memory/edit-diff";
import { containsSensitiveFacts } from "@/lib/personal-memory/sensitive-facts";
import { recordMemoryQualityEvent } from "@/lib/memory-apply/quality-metrics";
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
  getCorrectionCount,
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
  MAX_MEMORY_SUMMARY_CHARS,
  MAX_MEMORY_TITLE_CHARS,
  MAX_MEMORY_VALUE_CHARS,
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

async function hydrateOrThrow(userId: string): Promise<void> {
  const hydrated = await ensurePersonalMemoryHydrated(userId);
  if (hydrated && hydrated.ok === false) {
    throw new PersonalMemoryHydrationError();
  }
}

async function persistNow(userId: string): Promise<void> {
  if (typeof persistPersonalMemoryNow === "function") {
    await persistPersonalMemoryNow(userId);
    return;
  }
  schedulePersistPersonalMemory(userId);
}

function assertOwner(
  record: PersonalMemoryRecord | null,
  userId: string,
): PersonalMemoryRecord {
  if (!record || record.userId !== userId) {
    throw personalMemoryError("MEMORY_NOT_FOUND");
  }
  return record;
}

function assertValueSize(value: Record<string, unknown>): void {
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_MEMORY_VALUE_CHARS) {
    throw personalMemoryError("PAYLOAD_TOO_LARGE");
  }
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
  await hydrateOrThrow(userId);
  return readPersonalMemorySettings(userId);
}

export async function updatePersonalMemorySettings(
  userId: string,
  patch: Partial<PersonalMemorySettings> & {
    /** When disabling: keep | wipe */
    onDisable?: "keep" | "wipe";
  },
): Promise<PersonalMemorySettings> {
  await hydrateOrThrow(userId);
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
  await hydrateOrThrow(userId);
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
  await hydrateOrThrow(userId);
  return assertOwner(findStoredPersonalMemory(userId, id), userId);
}

export async function createPersonalMemory(
  userId: string,
  input: CreatePersonalMemoryInput,
): Promise<PersonalMemoryRecord> {
  await hydrateOrThrow(userId);
  const settings = readPersonalMemorySettings(userId);

  if (!settings.enabled && input.status !== "candidate") {
    throw personalMemoryError("MEMORY_DISABLED");
  }

  assertNoSecretsInValue(input.value);
  assertValueSize(input.value);
  const sensitivity =
    input.sensitivity ?? resolveSensitivity(input.scope, input.value);

  if (
    settings.blockSensitiveStorage &&
    (sensitivity === "sensitive" || sensitivity === "restricted")
  ) {
    throw personalMemoryError("SENSITIVE_STORAGE_BLOCKED");
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
    throw personalMemoryError("INFERENCE_CANNOT_AUTO_ACTIVATE");
  }
  if (input.source === "external_content") {
    throw personalMemoryError("EXTERNAL_CONTENT_BLOCKED");
  }

  const status: MemoryStatus =
    input.source === "explicit" || input.source === "user_explicit"
      ? requestedStatus === "candidate"
        ? "candidate"
        : requestedStatus === "superseded" ||
            requestedStatus === "deleted" ||
            requestedStatus === "paused" ||
            requestedStatus === "rejected" ||
            requestedStatus === "expired"
          ? requestedStatus
          : "active"
      : requestedStatus === "active" && input.source === "approved_inference"
        ? "active"
        : "candidate";

  const expiresAt =
    input.expiresAt !== undefined
      ? input.expiresAt
      : computeExpiresAt(input.retention ?? settings.defaultRetention);

  const now = nowIso();
  const idempotencyKey =
    input.idempotencyKey ??
    fingerprintCorrection({
      text: `${input.scope}:${input.key}:${JSON.stringify(input.value)}`,
      scope: input.scope,
      automationId: input.appliesTo?.automationIds?.[0] ?? null,
    });
  if (status === "candidate") {
    const duplicate = listStoredPersonalMemories(userId).find(
      (row) =>
        row.status === "candidate" &&
        (row.idempotencyKey === idempotencyKey ||
          (row.scope === input.scope &&
            row.key === input.key &&
            JSON.stringify(row.value) === JSON.stringify(input.value))),
    );
    if (duplicate) return duplicate;
  }

  const record: PersonalMemoryRecord = {
    id: randomUUID(),
    userId,
    kind: input.kind || kindForScope(input.scope),
    scope: input.scope,
    key: input.key,
    value: input.value,
    title: sanitizeUserFacingMemoryText(input.title).slice(0, MAX_MEMORY_TITLE_CHARS),
    summary: sanitizeUserFacingMemoryText(input.summary).slice(
      0,
      MAX_MEMORY_SUMMARY_CHARS,
    ),
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
    candidateReason: input.candidateReason ?? null,
    confirmedAt: status === "active" ? now : null,
    beforeValue: input.beforeValue ?? null,
    afterValue: input.afterValue ?? null,
    sourceJobId: input.sourceJobId ?? null,
    sourceBatchId: input.sourceBatchId ?? null,
    sourceItemId: input.sourceItemId ?? null,
    idempotencyKey,
    preferenceLayer: input.preferenceLayer ?? null,
  };

  upsertStoredPersonalMemory(record);
  trimBuckets(userId);
  await persistNow(userId);
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
  await hydrateOrThrow(userId);
  const current = assertOwner(findStoredPersonalMemory(userId, id), userId);
  if (patch.value) {
    assertNoSecretsInValue(patch.value);
    assertValueSize(patch.value);
  }

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
  await persistNow(userId);
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
  await hydrateOrThrow(userId);
  assertOwner(findStoredPersonalMemory(userId, id), userId);
  softDeleteMemory(userId, id);
  await persistNow(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "memory.delete",
    memoryId: id,
    meta: {},
  });
}

export async function deleteAllPersonalMemories(userId: string): Promise<number> {
  await hydrateOrThrow(userId);
  const rows = listStoredPersonalMemories(userId);
  for (const row of rows) {
    softDeleteMemory(userId, row.id);
  }
  await persistNow(userId);
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
  await hydrateOrThrow(userId);
  const current = assertOwner(findStoredPersonalMemory(userId, id), userId);
  if (current.status === "active") {
    return current;
  }
  if (current.status === "expired" || isExpired(current.expiresAt)) {
    if (current.status === "candidate") {
      upsertStoredPersonalMemory({
        ...current,
        status: "expired",
        updatedAt: nowIso(),
      });
      await persistNow(userId);
    }
    throw personalMemoryError("CANDIDATE_EXPIRED");
  }
  if (current.status === "superseded") {
    throw personalMemoryError("CANDIDATE_SUPERSEDED");
  }
  if (current.status !== "candidate") {
    throw personalMemoryError("NOT_A_CANDIDATE");
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
    appliesTo,
    expiresAt:
      scopeMode === "once" ? computeExpiresAt("once") : current.expiresAt,
    confirmedAt: nowIso(),
    updatedAt: nowIso(),
  };
  upsertStoredPersonalMemory(approved);
  await persistNow(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "candidate.approve",
    memoryId: id,
    meta: { scope: scopeMode },
  });
  recordMemoryQualityEvent({
    userId,
    type: "candidate_confirmed",
    channel: "personal_memory",
    jobId: current.sourceJobId,
    batchId: current.sourceBatchId,
    itemId: current.sourceItemId,
  });
  return approved;
}

export async function rejectCandidate(
  userId: string,
  id: string,
  reason?: string,
): Promise<PersonalMemoryRecord> {
  await hydrateOrThrow(userId);
  const current = assertOwner(findStoredPersonalMemory(userId, id), userId);
  if (current.status === "rejected") {
    return current;
  }
  if (current.status === "expired" || isExpired(current.expiresAt)) {
    throw personalMemoryError("CANDIDATE_EXPIRED");
  }
  if (current.status === "superseded") {
    throw personalMemoryError("CANDIDATE_SUPERSEDED");
  }
  if (current.status !== "candidate") {
    throw personalMemoryError("NOT_A_CANDIDATE");
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
  await persistNow(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "candidate.reject",
    memoryId: id,
    meta: {},
  });
  recordMemoryQualityEvent({
    userId,
    type: "candidate_rejected",
    channel: "personal_memory",
    jobId: current.sourceJobId,
    batchId: current.sourceBatchId,
    itemId: current.sourceItemId,
  });
  return rejected;
}

export async function pauseAllPersonalMemories(userId: string): Promise<number> {
  await hydrateOrThrow(userId);
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
  await hydrateOrThrow(userId);
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
  await hydrateOrThrow(signal.userId);
  const evaluated = evaluateCorrectionForCandidate(signal);
  if (evaluated.action === "none" || !evaluated.input) return null;

  const channelKey = (evaluated.input.appliesTo?.artifactTypes ?? [])
    .slice()
    .sort()
    .join("|");
  const existing = listStoredPersonalMemories(signal.userId).find((m) => {
    if (m.scope !== evaluated.input!.scope || m.key !== evaluated.input!.key) {
      return false;
    }
    const existingKey = [...m.appliesTo.artifactTypes].sort().join("|");
    if (existingKey !== channelKey) return false;
    return m.status === "active" || m.status === "candidate";
  });

  if (existing && evaluated.action === "explicit_active") {
    const updated = await updatePersonalMemory(signal.userId, existing.id, {
      value: evaluated.input.value,
      summary: evaluated.input.summary,
      title: evaluated.input.title,
      status: "active",
      appliesTo: {
        ...existing.appliesTo,
        ...(evaluated.input.appliesTo ?? {}),
      },
    });
    await supersedeConflictingActiveMemories({
      userId: signal.userId,
      keepId: updated.id,
      scope: updated.scope,
      key: updated.key,
      artifactTypes: updated.appliesTo.artifactTypes,
    });
    return updated;
  }

  if (
    existing &&
    existing.status === "candidate" &&
    evaluated.action === "candidate"
  ) {
    return existing;
  }

  const created = await createPersonalMemory(signal.userId, evaluated.input);
  if (evaluated.action === "explicit_active" && created.status === "active") {
    await supersedeConflictingActiveMemories({
      userId: signal.userId,
      keepId: created.id,
      scope: created.scope,
      key: created.key,
      artifactTypes: created.appliesTo.artifactTypes,
    });
  }

  const sensitive =
    containsSensitiveFacts(signal.text) ||
    containsSensitiveFacts(JSON.stringify(evaluated.input.value));
  if (sensitive && created.status === "active") {
    return updatePersonalMemory(signal.userId, created.id, { status: "candidate" });
  }

  if (
    !sensitive &&
    evaluated.action === "candidate" &&
    created.status === "candidate" &&
    isUnambiguousPreferenceValue(evaluated.input.value)
  ) {
    try {
      return await approveCandidate(signal.userId, created.id, {
        scope:
          (evaluated.input.appliesTo?.artifactTypes?.length ?? 0) > 0
            ? "automation"
            : "global",
        automationId: signal.automationId ?? null,
      });
    } catch {
      return created;
    }
  }

  return created;
}

async function supersedeConflictingActiveMemories(input: {
  userId: string;
  keepId: string;
  scope: PersonalMemoryRecord["scope"];
  key: string;
  artifactTypes: string[];
}): Promise<void> {
  const channelKey = [...input.artifactTypes].sort().join("|");
  const newIsGlobal = input.artifactTypes.length === 0;
  const rivals = listStoredPersonalMemories(input.userId).filter((row) => {
    if (row.id === input.keepId) return false;
    if (row.status !== "active") return false;
    if (row.scope !== input.scope || row.key !== input.key) return false;
    if (newIsGlobal) return true;
    const existingKey = [...row.appliesTo.artifactTypes].sort().join("|");
    return existingKey === channelKey;
  });
  for (const rival of rivals) {
    upsertStoredPersonalMemory({
      ...rival,
      status: "superseded",
      rejectedReason: "superseded",
      updatedAt: nowIso(),
    });
    appendPersonalMemoryAudit({
      userId: input.userId,
      action: "memory.update",
      memoryId: rival.id,
      meta: { status: "superseded", reason: "superseded", keepId: input.keepId },
    });
  }
}

function isUnambiguousPreferenceValue(value: Record<string, unknown>): boolean {
  return isUnambiguousStylePreference(value);
}

export async function ingestEditDiffAsCandidate(input: {
  userId: string;
  before: string;
  after: string;
  artifactType?: string | null;
  automationId?: string | null;
  jobId?: string | null;
  batchId?: string | null;
  itemId?: string | null;
  reason?: string;
}): Promise<PersonalMemoryRecord | null> {
  await hydrateOrThrow(input.userId);
  const metrics = measureEditDiff(input.before, input.after);
  recordMemoryQualityEvent({
    userId: input.userId,
    type: "generation_edited",
    channel: input.artifactType ?? "artifact",
    jobId: input.jobId,
    batchId: input.batchId,
    itemId: input.itemId,
    diffRate: metrics.diffRate,
    editChars: metrics.addedChars + metrics.deletedChars,
  });

  const preferenceText = preferenceTextFromEditDiff(metrics);
  if (!preferenceText && !metrics.requiresExplicitConfirm) return null;

  const fingerprint = fingerprintCorrection({
    text: `edit:${preferenceText || "sensitive_fact"}:${input.artifactType ?? ""}`,
    scope: "writing_style",
    automationId: input.automationId,
  });
  const repeatCount = getCorrectionCount(input.userId, fingerprint) + 1;
  const proposal = shouldProposeEditCandidate({ metrics, repeatCount });
  if (!proposal.propose && !metrics.requiresExplicitConfirm) {
    return ingestCorrectionSignal({
      userId: input.userId,
      text: preferenceText || "修正を記録",
      before: input.before,
      after: input.after,
      artifactType: input.artifactType ?? null,
      automationId: input.automationId ?? null,
      source: "user_correction",
    });
  }

  const text = metrics.requiresExplicitConfirm
    ? `${preferenceText || "事実の追記"}。確認するまで確定しません。`
    : preferenceText;

  return ingestCorrectionSignal({
    userId: input.userId,
    text,
    before: input.before,
    after: input.after,
    artifactType: input.artifactType ?? null,
    automationId: input.automationId ?? null,
    source: "user_correction",
  }).then((created) => {
    if (!created) return null;
    if (!metrics.requiresExplicitConfirm && created.status === "active") {
      return created;
    }
    if (created.status === "active" && metrics.requiresExplicitConfirm) {
      return updatePersonalMemory(input.userId, created.id, {
        status: "candidate",
        candidateReason: input.reason ?? "edit_diff_sensitive_fact",
        beforeValue: { text: input.before.slice(0, 400) },
        afterValue: { text: input.after.slice(0, 400) },
      });
    }
    return updatePersonalMemory(input.userId, created.id, {
      candidateReason: input.reason ?? "edit_diff",
      beforeValue: { text: input.before.slice(0, 400) },
      afterValue: { text: input.after.slice(0, 400) },
      sourceJobId: input.jobId ?? null,
      sourceBatchId: input.batchId ?? null,
      sourceItemId: input.itemId ?? null,
    });
  });
}

export async function resolveForContext(
  input: Omit<ResolveMemoryInput, "settings" | "memories"> & {
    userId: string;
  },
): Promise<{ result: ReturnType<typeof resolvePersonalMemories>; ledger: RunMemoryLedger }> {
  await hydrateOrThrow(input.userId);
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
  await hydrateOrThrow(userId);
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
