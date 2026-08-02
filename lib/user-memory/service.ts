import "server-only";

import { randomUUID } from "crypto";

import type { CreateAutomationInput } from "@/lib/automations/types";
import type { JobCategoryId } from "@/lib/user-profile/types";

import {
  appendStoredMemory,
  countStoredMemories,
  deleteStoredMemory,
  findStoredMemory,
  listStoredMemories,
  resetStoredMemories,
  updateStoredMemory,
} from "./store";
import { buildMemorySuggestions, partitionMemoriesForUi } from "./suggestions";
import type {
  CreateMemoryInput,
  MemoryCategory,
  MemoryListResponse,
  UpdateMemoryInput,
  UserMemory,
} from "./types";
import { MAX_MEMORIES_PER_USER } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function clampConfidence(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0.6;
  return Math.min(1, Math.max(0.1, value));
}

const JOB_TO_MEMORY_CATEGORY: Partial<Record<JobCategoryId, MemoryCategory>> = {
  sales_material: "sales",
  blog: "blog",
  sns_post: "sns",
  video: "video",
  email: "email",
  file_organize: "google",
  generic: "other",
};

export function mapJobCategoryToMemory(category: JobCategoryId): MemoryCategory {
  return JOB_TO_MEMORY_CATEGORY[category] ?? "other";
}

function upsertMemoryByKey(
  userId: string,
  key: string,
  input: CreateMemoryInput & { learningKey?: UserMemory["learningKey"] },
): UserMemory {
  const existing = listStoredMemories(userId).find(
    (m) =>
      m.learningKey === input.learningKey &&
      m.category === input.category &&
      m.title === input.title,
  );

  if (existing) {
    const confidence = clampConfidence(
      Math.min(1, existing.confidence + (input.confidence ?? 0.1) * 0.25),
    );
    return updateStoredMemory(userId, existing.memoryId, {
      content: input.content,
      confidence,
      lastUsedAt: nowIso(),
      updatedAt: nowIso(),
    })!;
  }

  const timestamp = nowIso();
  return appendStoredMemory(userId, {
    memoryId: `mem_${randomUUID()}`,
    userId,
    category: input.category,
    title: input.title,
    content: input.content,
    confidence: clampConfidence(input.confidence),
    pinned: input.pinned ?? false,
    learningKey: input.learningKey,
    lastUsedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function listUserMemories(userId: string): MemoryListResponse {
  const memories = listStoredMemories(userId);
  const suggestions = buildMemorySuggestions(memories);
  const sections = partitionMemoriesForUi(memories);

  return { memories, suggestions, sections };
}

export function createUserMemory(
  userId: string,
  input: CreateMemoryInput,
): UserMemory {
  if (countStoredMemories(userId) >= MAX_MEMORIES_PER_USER) {
    const bucket = listStoredMemories(userId);
    const removable = bucket
      .filter((m) => !m.pinned)
      .sort((a, b) => a.confidence - b.confidence)[0];
    if (removable) deleteStoredMemory(userId, removable.memoryId);
  }

  const timestamp = nowIso();
  return appendStoredMemory(userId, {
    memoryId: `mem_${randomUUID()}`,
    userId,
    category: input.category,
    title: input.title,
    content: input.content,
    confidence: clampConfidence(input.confidence ?? 0.8),
    pinned: input.pinned ?? false,
    learningKey: input.learningKey,
    lastUsedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function updateUserMemory(
  userId: string,
  memoryId: string,
  patch: UpdateMemoryInput,
): UserMemory | null {
  const existing = findStoredMemory(userId, memoryId);
  if (!existing) return null;

  return updateStoredMemory(userId, memoryId, {
    ...patch,
    confidence:
      patch.confidence !== undefined
        ? clampConfidence(patch.confidence)
        : existing.confidence,
    updatedAt: nowIso(),
    lastUsedAt: nowIso(),
  });
}

export function deleteUserMemory(userId: string, memoryId: string): boolean {
  return deleteStoredMemory(userId, memoryId);
}

export function toggleUserMemoryPin(
  userId: string,
  memoryId: string,
): UserMemory | null {
  const existing = findStoredMemory(userId, memoryId);
  if (!existing) return null;
  return updateStoredMemory(userId, memoryId, {
    pinned: !existing.pinned,
    updatedAt: nowIso(),
  });
}

export function resetUserMemories(
  userId: string,
  category?: MemoryCategory,
): number {
  return resetStoredMemories(userId, category);
}

/**
 * Legacy auto-learn entrypoint.
 * Personal Memory is now the source of truth: heuristics become *candidates*
 * via personal-memory (never auto-activated). Direct upserts are disabled.
 */
export function learnFromOrchestration(input: {
  userId: string;
  assignment: string;
  deliverableType?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): void {
  // Fire-and-forget candidate evaluation — must not block orchestration.
  void import("@/lib/personal-memory/service")
    .then(({ ingestCorrectionSignal }) =>
      ingestCorrectionSignal({
        userId: input.userId,
        text: input.assignment,
        artifactType: input.deliverableType ?? null,
        source: /今後|毎回|いつも|これから/.test(input.assignment)
          ? "user_explicit"
          : "system_inference",
      }),
    )
    .catch(() => undefined);

  // Intentionally no active upserts — prevents uncontrolled preference writes.
}

export function learnFromAutomation(
  userId: string,
  automation: CreateAutomationInput,
): void {
  void import("@/lib/personal-memory/service")
    .then(({ ingestCorrectionSignal }) =>
      ingestCorrectionSignal({
        userId,
        text: `今後は自動化「${automation.name}」: ${automation.workflow.assignment}`,
        source: "user_explicit",
      }),
    )
    .catch(() => undefined);
}

export function learnFromProfileSync(
  userId: string,
  profile: {
    frequentlyUsedJobs: Array<{ jobCategory: JobCategoryId; label: string; count: number }>;
    jobSettings: Partial<
      Record<
        JobCategoryId,
        {
          preferredFormat?: string;
          preferredHour?: number;
          preferredMinute?: number;
          executionLevel?: string;
          usageCount: number;
        }
      >
    >;
    manualOverrides: Array<{ label: string; summary: string; jobCategory: JobCategoryId }>;
  },
): void {
  for (const job of profile.frequentlyUsedJobs.slice(0, 5)) {
    const category = mapJobCategoryToMemory(job.jobCategory);
    upsertMemoryByKey(userId, `usage:${job.jobCategory}`, {
      category,
      title: `よく使う仕事: ${job.label}`,
      content: `${job.count}回利用`,
      confidence: Math.min(0.95, 0.4 + job.count * 0.05),
      learningKey: "preferred_service",
    });
  }

  for (const [jobCategory, settings] of Object.entries(profile.jobSettings)) {
    if (!settings || settings.usageCount < 2) continue;
    const category = mapJobCategoryToMemory(jobCategory as JobCategoryId);

    if (settings.preferredFormat) {
      upsertMemoryByKey(userId, `format:${jobCategory}`, {
        category,
        title: "成果物フォーマット",
        content: settings.preferredFormat,
        confidence: 0.75,
        learningKey: "layout",
      });
    }

    if (settings.preferredHour !== undefined) {
      const time = `${String(settings.preferredHour).padStart(2, "0")}:${String(settings.preferredMinute ?? 0).padStart(2, "0")}`;
      upsertMemoryByKey(userId, `time:${jobCategory}`, {
        category: "schedule",
        title: "よく使う時間帯",
        content: time,
        confidence: 0.7,
        learningKey: "post_time",
      });
    }

    if (settings.executionLevel) {
      upsertMemoryByKey(userId, `exec:${jobCategory}`, {
        category: "automation",
        title: "実行レベル",
        content: settings.executionLevel,
        confidence: 0.6,
        learningKey: "preferred_ai_employee",
      });
    }
  }

  for (const override of profile.manualOverrides) {
    const category = mapJobCategoryToMemory(override.jobCategory);
    upsertMemoryByKey(userId, `override:${override.label}`, {
      category,
      title: override.label,
      content: override.summary,
      confidence: 0.85,
      pinned: false,
    });
  }
}

export function getMemoriesForAssignment(
  userId: string,
  assignment: string,
  limit = 8,
): UserMemory[] {
  const text = assignment.toLowerCase();
  const memories = listStoredMemories(userId);

  const scored = memories.map((memory) => {
    let score = memory.confidence;
    if (memory.pinned) score += 0.5;

    const category = memory.category;
    if (category === "sales" && /営業|資料|sales/.test(text)) score += 0.4;
    if (category === "sns" && /sns|投稿|x/.test(text)) score += 0.4;
    if (category === "email" && /メール|mail/.test(text)) score += 0.4;
    if (category === "blog" && /ブログ|blog/.test(text)) score += 0.4;
    if (category === "automation" && /自動|習慣/.test(text)) score += 0.2;

    return { memory, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.memory);
}
