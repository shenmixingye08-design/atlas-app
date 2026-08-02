/**
 * Apply Personal Memory into deliverable source BEFORE generateDeliverables.
 * Does not modify Deliverable engine internals.
 */

import "server-only";

import { buildMemoryInjectionHeader } from "@/lib/atlas-personality";
import { recordMemoryApply } from "@/lib/personal-memory/apply-metrics";
import type { ArtifactKind } from "@/lib/personal-memory/apply-metrics";
import { resolveForContext } from "@/lib/personal-memory/service";

export type AppliedMemoryDeliverable = {
  content: string;
  assignment: string;
  title: string;
  injectionText: string;
  previewHeadline: string;
  memoriesApplied: number;
  memoryIds: string[];
  matchRate: number;
  diffRate: number;
  memoryScore: number;
};

function artifactKindFromFormats(formats?: string[] | null): ArtifactKind {
  const set = new Set((formats ?? []).map((f) => f.toLowerCase()));
  if (set.has("docx") || set.has("word")) return "word";
  if (set.has("xlsx") || set.has("excel")) return "excel";
  if (set.has("pptx") || set.has("ppt")) return "ppt";
  if (set.has("pdf") && set.size === 1) return "pdf";
  if (set.has("pdf")) return "pdf";
  return "other";
}

/**
 * Merge memory injection into content/assignment. Current instruction text stays;
 * memory is additive context (conflict policy already dropped overridden scopes).
 */
export async function applyMemoryToDeliverableSource(input: {
  userId: string;
  content: string;
  assignment: string;
  title: string;
  notes?: string | null;
  currentInstruction?: Record<string, unknown> | null;
  formats?: string[] | null;
  automationId?: string | null;
  artifactTypes?: string[];
}): Promise<AppliedMemoryDeliverable> {
  const { result, ledger } = await resolveForContext({
    userId: input.userId,
    notes: input.notes ?? input.assignment,
    currentInstruction: input.currentInstruction,
    automationId: input.automationId,
    artifactTypes: input.artifactTypes ?? input.formats ?? undefined,
    capabilities: input.artifactTypes,
  });

  const injection = result.injectionText.trim();
  const memoriesApplied = result.used.length;
  const memoryIds = ledger.memoryIdsUsed;

  let content = input.content;
  let assignment = input.assignment;
  if (injection) {
    const block = `${buildMemoryInjectionHeader()}\n${injection}`;
    content = `${block}\n\n---\n\n${content}`;
    assignment = `${assignment}\n\n【お客様の好み（今回の指示が優先）】\n${injection}`;
  }

  const matchRate =
    memoriesApplied === 0 ? 0 : Math.min(1, 0.55 + memoriesApplied * 0.08);
  // More memories applied → less expected user re-instruction (diff)
  const diffRate =
    memoriesApplied === 0
      ? 0.85
      : Math.max(0.15, 0.85 - memoriesApplied * 0.12);

  const event = recordMemoryApply({
    userId: input.userId,
    artifactKind: artifactKindFromFormats(input.formats),
    memoriesApplied,
    memoriesAvailable: Math.max(memoriesApplied, result.used.length + result.unused.length),
    matchRate,
    diffRate,
    instructionChars: (input.notes ?? input.assignment).length,
    memoryIds,
    success: true,
  });

  const appliedSummaries = result.used.map((u) => u.summary).filter(Boolean);
  return {
    content,
    assignment,
    title: input.title,
    injectionText: injection,
    previewHeadline:
      appliedSummaries.length > 0
        ? `今回適用します: ${appliedSummaries.slice(0, 6).join(" / ")}`
        : "今回適用する正式Memoryはありません",
    memoriesApplied,
    memoryIds,
    matchRate,
    diffRate,
    memoryScore: event.memoryScore,
  };
}
