/**
 * Unified Memory pipeline for every AI surface (Production Blocker #3).
 *
 *   loadMemory()
 *     → PersonalizationContext (+ MemoryVersion)
 *     → Prompt生成
 *     → AI実行
 *     → 成果物生成
 *     → saveMemory()
 *
 * Memory 未取得（load 失敗）で AI 実行は Fail Closed。
 */

import "server-only";

import { createHash } from "node:crypto";

import {
  MemoryApply,
  type MemoryApplyInput,
  type MemoryApplyOutput,
} from "@/lib/memory-apply/apply";
import type { PersonalizationContext } from "@/lib/memory-apply/personalization-context";
import type { MemoryApplyChannel } from "@/lib/memory-apply/types";
import { recordMemoryUpdateEvent } from "@/lib/memory-apply/metrics";
import type { PersonalMemoryScope } from "@/lib/personal-memory/types";
import type { CreatePersonalMemoryInput } from "@/lib/personal-memory/types";

export class MemoryLoadError extends Error {
  readonly code = "memory_load_failed";
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MemoryLoadError";
  }
}

export class MemoryRequiredError extends Error {
  readonly code = "memory_required_for_ai";
  constructor(message = "Memory未取得のためAI実行は禁止されています") {
    super(message);
    this.name = "MemoryRequiredError";
  }
}

/**
 * loadMemory() — Single Source of Truth entry.
 * Resolves PersonalizationContext for any AI channel.
 * Throws MemoryLoadError on failure (Fail Closed).
 */
export async function loadMemory(
  input: MemoryApplyInput,
): Promise<MemoryApplyOutput> {
  try {
    const applied = await MemoryApply(input);
    if (!applied.context.memoryVersion) {
      throw new MemoryLoadError("PersonalizationContext missing memoryVersion");
    }
    return applied;
  } catch (error) {
    if (error instanceof MemoryLoadError) throw error;
    const message =
      error instanceof Error ? error.message : "Memory load failed";
    throw new MemoryLoadError(message, error);
  }
}

/** Fail Closed: AI must not run without a loaded PersonalizationContext. */
export function assertMemoryLoadedForAi(
  context: PersonalizationContext | null | undefined,
): asserts context is PersonalizationContext {
  if (!context) {
    throw new MemoryRequiredError();
  }
  if (!context.memoryVersion?.checksum) {
    throw new MemoryRequiredError(
      "MemoryVersion不全のためAI実行は禁止されています",
    );
  }
  if (context.mode !== "on" && context.mode !== "off") {
    throw new MemoryRequiredError("Memory mode 不正のためAI実行は禁止されています");
  }
}

export type SaveMemoryCategory =
  | "user_settings"
  | "tone"
  | "forbidden"
  | "work_history"
  | "deliverable_history"
  | "external_service"
  | "schedule_history"
  | "vision_history"
  | "ocr_history"
  | "correction_history";

/** Map save categories onto existing PersonalMemoryScope (no new durable store). */
const CATEGORY_TO_SCOPE: Record<SaveMemoryCategory, PersonalMemoryScope> = {
  user_settings: "recurring_work_preferences",
  tone: "writing_style",
  forbidden: "writing_style",
  work_history: "work_content_style",
  deliverable_history: "preferred_formats",
  external_service: "default_storage_locations",
  schedule_history: "timezone",
  vision_history: "document_design",
  ocr_history: "language",
  correction_history: "work_content_style",
};

export type SaveMemoryInput = {
  userId: string;
  category: SaveMemoryCategory;
  channel: MemoryApplyChannel;
  title: string;
  summary: string;
  value: Record<string, unknown>;
  /** When true, store as candidate (default for inferences). */
  asCandidate?: boolean;
};

/**
 * saveMemory() — persist post-AI outcomes into Personal Memory SoT.
 * Does not invent a fourth store; uses createPersonalMemory.
 */
export async function saveMemory(input: SaveMemoryInput): Promise<{
  memoryId: string;
  category: SaveMemoryCategory;
  checksum: string;
}> {
  const { createPersonalMemory } = await import(
    "@/lib/personal-memory/service"
  );
  const scope = CATEGORY_TO_SCOPE[input.category];
  const key = `${input.category}:${input.channel}:${Date.now().toString(36)}`;
  const asCandidate = input.asCandidate !== false;
  const payload: CreatePersonalMemoryInput = {
    kind: "work_preference",
    scope,
    key,
    title: input.title.slice(0, 120),
    summary: input.summary.slice(0, 240),
    value: {
      ...input.value,
      category: input.category,
      channel: input.channel,
      savedAt: new Date().toISOString(),
    },
    source: asCandidate ? "automation_result" : "explicit",
    status: asCandidate ? "candidate" : "active",
  };

  const record = await createPersonalMemory(input.userId, payload);
  const checksum = createHash("sha256")
    .update(JSON.stringify({ id: record.id, value: record.value }))
    .digest("hex")
    .slice(0, 32);

  recordMemoryUpdateEvent(input.userId, 1);
  const { recordMemoryApplyEvent } = await import("@/lib/memory-apply/metrics");
  recordMemoryApplyEvent({
    userId: input.userId,
    channel: input.channel,
    memoryMode: "on",
    applied: true,
    memoryIdsUsed: [record.id],
    scopesUsed: [scope],
    improvementRate: 0,
    success: true,
  });

  return {
    memoryId: record.id,
    category: input.category,
    checksum,
  };
}

/**
 * Full AI secretary sequence helper.
 * loadMemory → (caller runs AI/artifact) → optional saveMemory.
 */
export async function withSharedMemory<T>(input: {
  memory: MemoryApplyInput;
  /** When true (default), throw if load fails — ban AI without Memory */
  failClosed?: boolean;
  run: (applied: MemoryApplyOutput) => Promise<T>;
  saveAfter?: (result: T, applied: MemoryApplyOutput) => Promise<SaveMemoryInput | null>;
}): Promise<{ result: T; applied: MemoryApplyOutput }> {
  const failClosed = input.failClosed !== false;
  let applied: MemoryApplyOutput;
  try {
    applied = await loadMemory(input.memory);
  } catch (error) {
    if (failClosed) throw error;
    throw error;
  }
  assertMemoryLoadedForAi(applied.context);
  const result = await input.run(applied);
  if (input.saveAfter) {
    const saveInput = await input.saveAfter(result, applied);
    if (saveInput) {
      await saveMemory(saveInput);
    }
  }
  return { result, applied };
}
