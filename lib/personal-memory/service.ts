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
  listSessionDisabledMemoryIds,
  readPersonalMemorySettings,
  setSessionDisabledMemory,
  upsertStoredPersonalMemory,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import type {
  CandidateDecision,
  CorrectionSignal,
  CreatePersonalMemoryInput,
  MemoryApplyPreviewItem,
  MemoryImprovementSuggestion,
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
  MEMORY_PROMOTE_CONFIDENCE,
  normalizeAppliesTo,
} from "@/lib/personal-memory/types";
import { appendPersonalMemoryAudit } from "@/lib/personal-memory/audit";
import { analyzeDeliverableDiff } from "@/lib/personal-memory/diff-learning";
import { buildImprovementSuggestions } from "@/lib/personal-memory/improvement-suggestions";
import { canPromoteByConfidence } from "@/lib/personal-memory/confidence";
import { evaluateDeliverableQuality } from "@/lib/personal-memory/quality/evaluate";
import { buildMemoryQualityDashboard } from "@/lib/personal-memory/quality/dashboard";
import { listQualityEvaluations } from "@/lib/personal-memory/quality/store";
import type {
  DeliverableQualityEvaluation,
  MemoryQualityDashboard,
} from "@/lib/personal-memory/quality/types";
import {
  buildPredictiveDashboard,
  predictMemoriesForContext,
  recordPredictionOutcomes,
  togglePredictedMemory,
} from "@/lib/personal-memory/predict/engine";
import {
  bumpSuggestionAccepted,
  dismissSuggestionFingerprint,
  getPredictionPreview,
} from "@/lib/personal-memory/predict/store";
import type {
  PredictiveApplyPreview,
  PredictiveMemoryDashboard,
  PredictionOutcome,
} from "@/lib/personal-memory/predict/types";

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
    appliesTo: normalizeAppliesTo(input.appliesTo),
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
    appliesTo: patch.appliesTo
      ? normalizeAppliesTo(patch.appliesTo)
      : current.appliesTo,
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
  assertOwner(findStoredPersonalMemory(userId, id), userId);
  softDeleteMemory(userId, id);
  schedulePersistPersonalMemory(userId);
  appendPersonalMemoryAudit({
    userId,
    action: "memory.delete",
    memoryId: id,
    meta: {},
  });
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

  const nextConfidence = Math.max(
    current.confidence,
    scopeMode === "once" ? 0.8 : MEMORY_PROMOTE_CONFIDENCE,
  );
  // Never auto-activate without user decision; approval is the gate.
  // Confidence still recorded for UI bands.
  if (!canPromoteByConfidence(nextConfidence) && scopeMode !== "once") {
    // User explicitly approved → allow activation even if prior confidence was low.
  }

  const approved: PersonalMemoryRecord = {
    ...current,
    status: "active",
    source: "approved_inference",
    confidence: Math.min(0.98, nextConfidence),
    appliesTo: normalizeAppliesTo(appliesTo),
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
    meta: { scope: scopeMode, confidence: approved.confidence },
  });
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
  const sessionDisabledIds = Array.from(
    new Set([
      ...(input.sessionDisabledIds ?? []),
      ...listSessionDisabledMemoryIds(input.userId),
    ]),
  );
  const result = resolvePersonalMemories({
    ...input,
    sessionDisabledIds,
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

/**
 * Learn from deliverable before/after Diff → candidate memories only.
 * Always records a quality evaluation so Memory Score / Diff rate can prove impact.
 */
export async function learnFromDeliverableDiff(input: {
  userId: string;
  before: string;
  after: string;
  automationId?: string | null;
  artifactType?: string | null;
  workCategory?: string | null;
  companyId?: string | null;
  templateId?: string | null;
}): Promise<PersonalMemoryRecord[]> {
  const { memories } = await learnFromDeliverableDiffWithQuality(input);
  return memories;
}

export async function learnFromDeliverableDiffWithQuality(input: {
  userId: string;
  before: string;
  after: string;
  automationId?: string | null;
  artifactType?: string | null;
  workCategory?: string | null;
  companyId?: string | null;
  templateId?: string | null;
}): Promise<{
  memories: PersonalMemoryRecord[];
  evaluation: DeliverableQualityEvaluation;
}> {
  await ensurePersonalMemoryHydrated(input.userId);
  const settings = readPersonalMemorySettings(input.userId);

  // Evaluate against currently active Memory (pre-learning) so Diff proves impact.
  const evaluation = evaluateDeliverableQuality({
    userId: input.userId,
    before: input.before,
    after: input.after,
    artifactType: input.artifactType,
    workCategory: input.workCategory,
    companyId: input.companyId,
    automationId: input.automationId,
    templateId: input.templateId,
  });

  const created: PersonalMemoryRecord[] = [];
  if (!settings.enabled || !settings.proposeFromCorrections) {
    return { memories: created, evaluation };
  }

  const signals = analyzeDeliverableDiff({
    before: input.before,
    after: input.after,
    artifactType: input.artifactType,
    workCategory: input.workCategory,
  });
  if (signals.length === 0) {
    return { memories: created, evaluation };
  }

  for (const signal of signals) {
    const text = signal.summary;
    const record = await ingestCorrectionSignal({
      userId: input.userId,
      text,
      before: input.before.slice(0, 4000),
      after: input.after.slice(0, 4000),
      automationId: input.automationId ?? null,
      artifactType: input.artifactType ?? null,
      workCategory: input.workCategory ?? null,
      companyId: input.companyId ?? null,
      templateId: input.templateId ?? null,
      source: "user_correction",
    });
    if (!record) continue;

    // Attach category / company / template scope without activating.
    const appliesTo = normalizeAppliesTo({
      ...record.appliesTo,
      global:
        !input.automationId &&
        !input.workCategory &&
        !input.companyId &&
        !input.templateId,
      workCategories: input.workCategory
        ? [input.workCategory]
        : record.appliesTo.workCategories,
      companyIds: input.companyId
        ? [input.companyId]
        : record.appliesTo.companyIds,
      templateIds: input.templateId
        ? [input.templateId]
        : record.appliesTo.templateIds,
      artifactTypes: input.artifactType
        ? Array.from(
            new Set([...record.appliesTo.artifactTypes, input.artifactType]),
          )
        : record.appliesTo.artifactTypes,
    });
    const updated = await updatePersonalMemory(input.userId, record.id, {
      appliesTo,
      value: { ...record.value, ...signal.value },
      title: signal.title,
      summary: signal.summary,
      confidence: Math.max(
        record.confidence,
        Math.min(0.84, 0.45 + signal.strength * 0.4),
      ),
    });
    created.push(updated);
  }
  return { memories: created, evaluation };
}

export async function getMemoryQualityDashboardForUser(
  userId: string,
): Promise<MemoryQualityDashboard> {
  await ensurePersonalMemoryHydrated(userId);
  const memories = listStoredPersonalMemories(userId);
  const suggestions = await listMemoryImprovementSuggestions(userId);
  return buildMemoryQualityDashboard({
    evaluations: listQualityEvaluations(userId),
    memories,
    suggestions,
  });
}

export async function decideCandidate(
  userId: string,
  id: string,
  decision: CandidateDecision,
  options?: { automationId?: string | null },
): Promise<PersonalMemoryRecord> {
  if (decision === "never") {
    return rejectCandidate(userId, id, "user_said_no");
  }
  if (decision === "once") {
    return approveCandidate(userId, id, {
      scope: "once",
      automationId: options?.automationId,
    });
  }
  return approveCandidate(userId, id, {
    scope: "global",
    automationId: options?.automationId,
  });
}

export async function getApplyPreviewForContext(
  input: Omit<ResolveMemoryInput, "settings" | "memories"> & {
    userId: string;
    disabledMemoryIds?: readonly string[] | null;
  },
): Promise<{
  items: MemoryApplyPreviewItem[];
  injectionText: string;
  ledger: RunMemoryLedger;
  prediction: PredictiveApplyPreview;
}> {
  await ensurePersonalMemoryHydrated(input.userId);
  const prediction = predictMemoriesForContext({
    userId: input.userId,
    notes: input.notes,
    workCategory: input.workCategory,
    companyId: input.companyId,
    automationId: input.automationId,
    templateId: input.templateId,
    artifactTypes: input.artifactTypes,
    sessionDisabledIds: input.sessionDisabledIds,
    currentInstruction: input.currentInstruction,
    disabledMemoryIds: input.disabledMemoryIds,
  });
  const { result, ledger } = await resolveForContext({
    ...input,
    // Only inject auto-applied (enabled + score>=60) memories into the run.
    sessionDisabledIds: [
      ...(input.sessionDisabledIds ?? []),
      ...prediction.items
        .filter((i) => i.memoryId && !i.enabled)
        .map((i) => i.memoryId!),
    ],
  });
  schedulePersistPersonalMemory(input.userId);
  return {
    items: prediction.autoApplyItems.map((i) => ({
      scope: i.scope,
      title: i.title,
      summary: i.summary,
      layer: i.layer,
      memoryId: i.memoryId,
    })),
    injectionText: prediction.injectionText || result.injectionText,
    ledger,
    prediction,
  };
}

export async function getPredictivePreviewForUser(
  input: Omit<ResolveMemoryInput, "settings" | "memories"> & {
    userId: string;
    disabledMemoryIds?: readonly string[] | null;
  },
): Promise<PredictiveApplyPreview> {
  const preview = await getApplyPreviewForContext(input);
  return preview.prediction;
}

export async function togglePredictiveMemoryForUser(input: {
  userId: string;
  predictionId: string;
  memoryId: string;
  enabled: boolean;
}): Promise<PredictiveApplyPreview> {
  await ensurePersonalMemoryHydrated(input.userId);
  const updated = togglePredictedMemory(input);
  if (!updated) throw new Error("PREDICTION_NOT_FOUND");
  if (!input.enabled) {
    setSessionDisabledMemory(input.userId, input.memoryId, true);
  } else {
    setSessionDisabledMemory(input.userId, input.memoryId, false);
  }
  schedulePersistPersonalMemory(input.userId);
  return updated;
}

export async function acceptPredictivePreview(input: {
  userId: string;
  predictionId: string;
  /** If provided, only these memory ids are treated as accepted */
  enabledMemoryIds?: string[];
}): Promise<PredictiveApplyPreview> {
  await ensurePersonalMemoryHydrated(input.userId);
  const preview = getPredictionPreview(input.userId, input.predictionId);
  if (!preview) throw new Error("PREDICTION_NOT_FOUND");

  const enabledSet = input.enabledMemoryIds
    ? new Set(input.enabledMemoryIds)
    : null;

  const outcomes = preview.items
    .filter((i) => i.memoryId)
    .map((i) => {
      const enabled = enabledSet
        ? enabledSet.has(i.memoryId!)
        : i.enabled;
      const outcome: PredictionOutcome = enabled ? "accepted" : "toggled_off";
      return { memoryId: i.memoryId!, outcome, enabled };
    });
  recordPredictionOutcomes({
    userId: input.userId,
    predictionId: input.predictionId,
    outcomes,
  });
  schedulePersistPersonalMemory(input.userId);
  return preview;
}

export async function getPredictiveMemoryDashboard(
  userId: string,
): Promise<PredictiveMemoryDashboard> {
  await ensurePersonalMemoryHydrated(userId);
  return buildPredictiveDashboard(userId);
}

export async function dismissProactiveSuggestionForUser(
  userId: string,
  fingerprint: string,
): Promise<void> {
  await ensurePersonalMemoryHydrated(userId);
  dismissSuggestionFingerprint(userId, fingerprint);
  schedulePersistPersonalMemory(userId);
}

export async function acceptProactiveSuggestionForUser(
  userId: string,
  fingerprint: string,
): Promise<void> {
  await ensurePersonalMemoryHydrated(userId);
  bumpSuggestionAccepted(userId, 1);
  dismissSuggestionFingerprint(userId, fingerprint);
  schedulePersistPersonalMemory(userId);
}

export async function listMemoryImprovementSuggestions(
  userId: string,
): Promise<MemoryImprovementSuggestion[]> {
  await ensurePersonalMemoryHydrated(userId);
  const memories = listStoredPersonalMemories(userId);
  const recentCorrections = memories
    .flatMap((memory) =>
      memory.evidence
        .filter((e) => e.kind === "correction")
        .map((e) => ({
          text: e.summary,
          before:
            typeof memory.value.before === "string"
              ? memory.value.before
              : null,
          after:
            typeof memory.value.after === "string" ? memory.value.after : null,
        })),
    )
    .slice(0, 10);
  return buildImprovementSuggestions({ memories, recentCorrections });
}

export async function disableMemoryForThisRun(
  userId: string,
  memoryId: string,
): Promise<void> {
  await ensurePersonalMemoryHydrated(userId);
  assertOwner(findStoredPersonalMemory(userId, memoryId), userId);
  setSessionDisabledMemory(userId, memoryId, true);
  appendPersonalMemoryAudit({
    userId,
    action: "memory.session_disable",
    memoryId,
    meta: {},
  });
}

export async function clearMemorySessionDisable(
  userId: string,
  memoryId: string,
): Promise<void> {
  await ensurePersonalMemoryHydrated(userId);
  setSessionDisabledMemory(userId, memoryId, false);
}
