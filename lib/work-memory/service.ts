import "server-only";

import { randomUUID } from "crypto";

import { schedulePersistWorkMemory } from "./durable";
import {
  appendStoredCandidate,
  appendStoredWorkMemory,
  countStoredWorkMemories,
  deleteStoredCandidate,
  deleteStoredWorkMemory,
  findStoredCandidate,
  findStoredWorkMemory,
  getRequestFingerprintCount,
  listStoredCandidates,
  listStoredWorkMemories,
  readWorkMemorySettings,
  recordRequestFingerprint,
  resetStoredCandidates,
  resetStoredWorkMemories,
  updateStoredWorkMemory,
  writeWorkMemorySettings,
} from "./store";
import {
  buildAssignmentFingerprint,
  filterWorkMemories,
  rankWorkMemoriesForAssignment,
} from "./search";
import {
  buildCorrectionCandidate,
  buildOrchestrationResultCandidate,
  detectMemorySignals,
  type DetectedMemorySignal,
} from "./learning";
import { sanitizeMemoryText, sanitizeStructuredData } from "./security";
import type {
  CreateWorkMemoryInput,
  UpdateWorkMemoryInput,
  WorkMemoryCandidate,
  WorkMemoryListFilters,
  WorkMemoryListResponse,
  WorkMemoryRecord,
  WorkMemorySettings,
  WorkMemorySummary,
  WorkMemoryType,
} from "./types";
import { MAX_CANDIDATES_PER_USER, MAX_WORK_MEMORIES_PER_USER } from "./types";
import { summarizeWorkMemoriesForClient } from "./metadata";

function nowIso(): string {
  return new Date().toISOString();
}

function clampConfidence(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0.6;
  return Math.min(1, Math.max(0.1, value));
}

function trimCandidateBucket(userId: string): void {
  const candidates = listStoredCandidates(userId);
  if (candidates.length <= MAX_CANDIDATES_PER_USER) return;
  const overflow = candidates.slice(MAX_CANDIDATES_PER_USER);
  for (const candidate of overflow) {
    deleteStoredCandidate(userId, candidate.candidateId);
  }
}

function trimMemoryBucket(userId: string): void {
  if (countStoredWorkMemories(userId) <= MAX_WORK_MEMORIES_PER_USER) return;
  const removable = listStoredWorkMemories(userId)
    .filter((m) => !m.isUserConfirmed && !m.isActive)
    .sort((a, b) => a.confidence - b.confidence)[0];
  if (removable) deleteStoredWorkMemory(userId, removable.id);
}

export function isWorkMemoryEnabled(userId: string): boolean {
  return readWorkMemorySettings(userId).enabled;
}

export function getWorkMemorySettings(userId: string): WorkMemorySettings {
  return readWorkMemorySettings(userId);
}

export function setWorkMemoryEnabled(
  userId: string,
  enabled: boolean,
): WorkMemorySettings {
  const settings = writeWorkMemorySettings(userId, { enabled });
  schedulePersistWorkMemory(userId);
  return settings;
}

export function listWorkMemories(
  userId: string,
  filters: WorkMemoryListFilters = {},
): WorkMemoryListResponse {
  const all = listStoredWorkMemories(userId);
  const memories = filterWorkMemories(
    all,
    filters.query ?? "",
    filters.type ?? "all",
    filters.activeOnly ?? false,
  ).filter((memory) =>
    filters.includeUnconfirmed === false ? memory.isUserConfirmed : true,
  );

  return {
    memories,
    candidates: listStoredCandidates(userId),
    settings: readWorkMemorySettings(userId),
    total: memories.length,
  };
}

export function getWorkMemory(
  userId: string,
  id: string,
): WorkMemoryRecord | null {
  const memory = findStoredWorkMemory(userId, id);
  if (!memory || memory.userId !== userId) return null;
  return memory;
}

export function createWorkMemory(
  userId: string,
  input: CreateWorkMemoryInput,
): WorkMemoryRecord | null {
  const title = sanitizeMemoryText(input.title);
  const summary = sanitizeMemoryText(input.summary);
  if (!title || !summary) return null;

  const structuredData =
    sanitizeStructuredData(input.structuredData ?? {}) ?? {};

  trimMemoryBucket(userId);
  const timestamp = nowIso();

  const memory = appendStoredWorkMemory(userId, {
    id: `wm_${randomUUID()}`,
    userId,
    type: input.type,
    title,
    summary,
    structuredData,
    sourceType: input.sourceType ?? "manual",
    sourceReference: input.sourceReference ?? null,
    tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    confidence: clampConfidence(input.confidence ?? 0.8),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
    usageCount: 0,
    isActive: true,
    isUserConfirmed: input.isUserConfirmed ?? true,
  });
  schedulePersistWorkMemory(userId);
  return memory;
}

export function updateWorkMemory(
  userId: string,
  id: string,
  patch: UpdateWorkMemoryInput,
): WorkMemoryRecord | null {
  const existing = getWorkMemory(userId, id);
  if (!existing) return null;

  const title =
    patch.title !== undefined ? sanitizeMemoryText(patch.title) : existing.title;
  const summary =
    patch.summary !== undefined
      ? sanitizeMemoryText(patch.summary)
      : existing.summary;

  if (!title || !summary) return null;

  const structuredData =
    patch.structuredData !== undefined
      ? (sanitizeStructuredData(patch.structuredData) ?? existing.structuredData)
      : existing.structuredData;

  const updated = updateStoredWorkMemory(userId, id, {
    ...patch,
    title,
    summary,
    structuredData,
    confidence:
      patch.confidence !== undefined
        ? clampConfidence(patch.confidence)
        : existing.confidence,
    updatedAt: nowIso(),
  });
  if (updated) schedulePersistWorkMemory(userId);
  return updated;
}

export function deactivateWorkMemory(
  userId: string,
  id: string,
): WorkMemoryRecord | null {
  return updateWorkMemory(userId, id, { isActive: false });
}

export function deleteWorkMemory(userId: string, id: string): boolean {
  const existing = getWorkMemory(userId, id);
  if (!existing) return false;
  const removed = deleteStoredWorkMemory(userId, id);
  if (removed) schedulePersistWorkMemory(userId);
  return removed;
}

export function resetWorkMemories(
  userId: string,
  type?: WorkMemoryType,
): number {
  resetStoredCandidates(userId);
  const count = resetStoredWorkMemories(userId, type);
  schedulePersistWorkMemory(userId);
  return count;
}

export function searchWorkMemories(
  userId: string,
  query: string,
  options?: { type?: WorkMemoryType | "all"; limit?: number },
): WorkMemoryRecord[] {
  const filtered = filterWorkMemories(
    listStoredWorkMemories(userId),
    query,
    options?.type ?? "all",
    true,
  );
  return filtered.slice(0, options?.limit ?? 20);
}

export function getWorkMemoriesForAssignment(
  userId: string,
  assignment: string,
  limit = 8,
): WorkMemoryRecord[] {
  if (!isWorkMemoryEnabled(userId)) return [];
  const active = listStoredWorkMemories(userId).filter((m) => m.isActive);
  return rankWorkMemoriesForAssignment(active, assignment, limit);
}

export function markWorkMemoriesUsed(
  userId: string,
  memoryIds: readonly string[],
): void {
  const timestamp = nowIso();
  let touched = false;
  for (const id of memoryIds) {
    const existing = getWorkMemory(userId, id);
    if (!existing) continue;
    updateStoredWorkMemory(userId, id, {
      lastUsedAt: timestamp,
      usageCount: existing.usageCount + 1,
      updatedAt: timestamp,
    });
    touched = true;
  }
  if (touched) schedulePersistWorkMemory(userId);
}

export function previewWorkMemoriesForAssignment(
  userId: string,
  assignment: string,
): WorkMemorySummary[] {
  return summarizeWorkMemoriesForClient(
    getWorkMemoriesForAssignment(userId, assignment),
  );
}

function createCandidateFromSignal(
  userId: string,
  signal: DetectedMemorySignal,
  sourceReference?: string | null,
): WorkMemoryCandidate | null {
  const title = sanitizeMemoryText(signal.title);
  const summary = sanitizeMemoryText(signal.summary);
  if (!title || !summary) return null;

  const structuredData = sanitizeStructuredData(signal.structuredData);
  if (!structuredData) return null;

  trimCandidateBucket(userId);

  const candidate = appendStoredCandidate(userId, {
    candidateId: `wmc_${randomUUID()}`,
    userId,
    type: signal.type,
    title,
    summary,
    structuredData,
    sourceType: signal.sourceType,
    sourceReference: sourceReference ?? null,
    tags: [],
    confidence: clampConfidence(signal.confidence),
    reason: signal.reason,
    createdAt: nowIso(),
  });
  schedulePersistWorkMemory(userId);
  return candidate;
}

export function createWorkMemoryCandidate(
  userId: string,
  signal: DetectedMemorySignal,
  sourceReference?: string | null,
): WorkMemoryCandidate | null {
  if (signal.confidence < 0.5) return null;
  return createCandidateFromSignal(userId, signal, sourceReference);
}

export function confirmWorkMemoryCandidate(
  userId: string,
  candidateId: string,
): WorkMemoryRecord | null {
  const candidate = findStoredCandidate(userId, candidateId);
  if (!candidate || candidate.userId !== userId) return null;

  const memory = createWorkMemory(userId, {
    type: candidate.type,
    title: candidate.title,
    summary: candidate.summary,
    structuredData: candidate.structuredData,
    sourceType: candidate.sourceType,
    sourceReference: candidate.sourceReference,
    tags: candidate.tags,
    confidence: Math.max(candidate.confidence, 0.75),
    isUserConfirmed: true,
  });

  if (memory) {
    deleteStoredCandidate(userId, candidateId);
    schedulePersistWorkMemory(userId);
  }
  return memory;
}

export function rejectWorkMemoryCandidate(
  userId: string,
  candidateId: string,
): boolean {
  const candidate = findStoredCandidate(userId, candidateId);
  if (!candidate || candidate.userId !== userId) return false;
  const removed = deleteStoredCandidate(userId, candidateId);
  if (removed) schedulePersistWorkMemory(userId);
  return removed;
}

export function learnFromOrchestrationWorkMemory(input: {
  userId: string;
  assignment: string;
  deliverableType?: string;
  finalResponse?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): WorkMemoryCandidate[] {
  if (!isWorkMemoryEnabled(input.userId)) return [];

  const fingerprint = buildAssignmentFingerprint(input.assignment);
  recordRequestFingerprint(input.userId, fingerprint, input.assignment);
  const repeatCount = getRequestFingerprintCount(input.userId, fingerprint);

  const signals = detectMemorySignals({
    assignment: input.assignment,
    metadata: input.metadata,
    repeatCount,
  });

  const resultSignal = buildOrchestrationResultCandidate({
    assignment: input.assignment,
    deliverableType: input.deliverableType,
    finalResponse: input.finalResponse,
  });
  if (resultSignal && repeatCount >= 2) {
    signals.push(resultSignal);
  }

  const correctionBefore =
    typeof input.metadata?.correctionBefore === "string"
      ? input.metadata.correctionBefore
      : null;
  const correctionAfter =
    typeof input.metadata?.correctionAfter === "string"
      ? input.metadata.correctionAfter
      : null;

  if (correctionBefore && correctionAfter) {
    const correctionSignal = buildCorrectionCandidate(
      correctionBefore,
      correctionAfter,
    );
    if (correctionSignal) signals.push(correctionSignal);
  }

  const created: WorkMemoryCandidate[] = [];
  for (const signal of signals) {
    const needsConfirmation =
      signal.trigger !== "explicit_save" || signal.confidence < 0.85;

    if (needsConfirmation) {
      const candidate = createWorkMemoryCandidate(input.userId, signal);
      if (candidate) created.push(candidate);
      continue;
    }

    createWorkMemory(input.userId, {
      type: signal.type,
      title: signal.title,
      summary: signal.summary,
      structuredData: signal.structuredData,
      sourceType: signal.sourceType,
      confidence: signal.confidence,
      isUserConfirmed: true,
    });
  }

  schedulePersistWorkMemory(input.userId);
  return created;
}

export function learnFromCorrectionDiff(input: {
  userId: string;
  before: string;
  after: string;
  sourceReference?: string;
}): WorkMemoryCandidate | null {
  if (!isWorkMemoryEnabled(input.userId)) return null;
  const signal = buildCorrectionCandidate(input.before, input.after);
  if (!signal) return null;
  return createWorkMemoryCandidate(
    input.userId,
    signal,
    input.sourceReference ?? null,
  );
}

export function exportWorkMemoriesForUser(userId: string): WorkMemoryRecord[] {
  return listStoredWorkMemories(userId);
}
