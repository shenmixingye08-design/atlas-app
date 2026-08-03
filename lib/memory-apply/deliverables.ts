import "server-only";

import { getWordCompanyBrand } from "@/lib/deliverables/company-brand";
import type { DeliverableFormat } from "@/lib/deliverables/types";
import { buildDeliverableOverlay } from "@/lib/memory-apply/overlays";
import {
  assertMemoryLoadedForAi,
  loadMemory,
  saveMemory,
} from "@/lib/memory-apply/pipeline";
import type {
  MemoryApplyChannel,
  MemoryDeliverableOverlay,
  MemoryQualityDiff,
} from "@/lib/memory-apply/types";

function channelForFormat(format: DeliverableFormat): MemoryApplyChannel {
  switch (format) {
    case "docx":
      return "word";
    case "xlsx":
      return "excel";
    case "pdf":
      return "pdf";
    case "pptx":
      return "powerpoint";
    default:
      return "word";
  }
}

export type DeliverableMemoryApply = {
  content: string;
  overlay: MemoryDeliverableOverlay;
  memoryIdsUsed: string[];
  quality: MemoryQualityDiff;
  applied: boolean;
  channel: MemoryApplyChannel;
};

/**
 * Resolve Personal Memory overlays for deliverable generation.
 * Path: loadMemory → PersonalizationContext → PromptBuilder (no parallel resolve).
 */
export async function applyMemoryForDeliverable(input: {
  userId: string;
  content: string;
  format: DeliverableFormat;
  assignment?: string;
}): Promise<DeliverableMemoryApply> {
  const channel = channelForFormat(input.format);
  const brandFallback = await getWordCompanyBrand(input.userId);

  const applied = await loadMemory({
    userId: input.userId,
    channel,
    baseline: input.content,
    assignment: input.assignment ?? input.content.slice(0, 400),
    artifactTypes: [input.format],
    capabilities: ["deliverable", input.format, channel],
    // No per-surface scope silo — shared PersonalizationContext for all AI
  });
  assertMemoryLoadedForAi(applied.context);

  const overlay: MemoryDeliverableOverlay =
    brandFallback && !applied.context.deliverable.brand
      ? buildDeliverableOverlay({
          userId: input.userId,
          values: applied.provider.personalValues,
          injectionText: applied.context.injectionText,
          tokenEstimate: applied.context.tokenEstimate,
          brandFallback,
        })
      : applied.context.deliverable;

  const appliedFlag =
    applied.context.memoryIdsUsed.length > 0 || Boolean(overlay.brand);

  return {
    content: applied.prompt.withMemory,
    overlay,
    memoryIdsUsed: applied.context.memoryIdsUsed,
    quality: applied.quality,
    applied: appliedFlag,
    channel,
  };
}

/** Persist deliverable outcome into shared Memory after artifact generation. */
export async function saveDeliverableMemoryHistory(input: {
  userId: string;
  format: DeliverableFormat;
  assignment?: string | null;
  summary?: string | null;
  memoryIdsUsed?: string[];
}): Promise<void> {
  const channel = channelForFormat(input.format);
  try {
    await saveMemory({
      userId: input.userId,
      category: "deliverable_history",
      channel,
      title: `${channel}成果物履歴`,
      summary: (input.summary ?? input.assignment ?? channel).slice(0, 240),
      value: {
        format: input.format,
        assignment: input.assignment ?? null,
        memoryIdsUsed: input.memoryIdsUsed ?? [],
      },
      asCandidate: true,
    });
  } catch {
    // Fail soft on persist — generation already succeeded
  }
}
