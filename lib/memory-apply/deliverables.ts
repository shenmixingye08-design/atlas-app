import "server-only";

import { getWordCompanyBrand } from "@/lib/deliverables/company-brand";
import type { DeliverableFormat } from "@/lib/deliverables/types";
import { MemoryApply } from "@/lib/memory-apply/apply";
import { buildDeliverableOverlay } from "@/lib/memory-apply/overlays";
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
 * Path: MemoryApply → PersonalizationContext → PromptBuilder (no parallel resolve).
 */
export async function applyMemoryForDeliverable(input: {
  userId: string;
  content: string;
  format: DeliverableFormat;
  assignment?: string;
}): Promise<DeliverableMemoryApply> {
  const channel = channelForFormat(input.format);
  const brandFallback = await getWordCompanyBrand(input.userId);

  const applied = await MemoryApply({
    userId: input.userId,
    channel,
    baseline: input.content,
    assignment: input.assignment ?? input.content.slice(0, 400),
    artifactTypes: [input.format],
    capabilities: ["deliverable", input.format, channel],
    // No per-surface scope silo — shared PersonalizationContext for all AI
  });

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
