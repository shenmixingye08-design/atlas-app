import "server-only";

import { getWordCompanyBrand } from "@/lib/deliverables/company-brand";
import type { DeliverableFormat } from "@/lib/deliverables/types";
import { resolveForContext } from "@/lib/personal-memory/service";
import {
  applyContentOverlayToText,
  buildContentOverlay,
  buildDeliverableOverlay,
} from "@/lib/memory-apply/overlays";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";
import {
  compareMemoryQuality,
  expectedTokensFromMemoryValues,
} from "@/lib/memory-apply/quality-diff";
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
  memoryRetrieved: boolean;
  memoryApplied: boolean;
  appliedPreferenceKeys: string[];
};

/**
 * Resolve Personal Memory overlays for deliverable generation.
 */
export async function applyMemoryForDeliverable(input: {
  userId: string;
  content: string;
  format: DeliverableFormat;
  assignment?: string;
}): Promise<DeliverableMemoryApply> {
  const brandFallback = await getWordCompanyBrand(input.userId);
  const { result, ledger } = await resolveForContext({
    userId: input.userId,
    notes: input.assignment ?? input.content.slice(0, 400),
    artifactTypes: [input.format],
    allowedScopes: [
      "writing_style",
      "document_design",
      "color_palette",
      "preferred_formats",
      "word_template",
      "excel_template",
      "powerpoint_theme",
      "pdf_layout",
      "contact_info",
      "file_naming",
      "date_format",
      "currency",
      "work_content_style",
    ],
  });

  const contentOverlay = buildContentOverlay({
    values: ledger.memoryValuesResolved,
    injectionText: result.injectionText,
  });
  const overlay = buildDeliverableOverlay({
    userId: input.userId,
    values: ledger.memoryValuesResolved,
    injectionText: result.injectionText,
    tokenEstimate: result.tokenEstimate,
    brandFallback,
  });

  const next = applyContentOverlayToText(input.content, contentOverlay);
  const flat: Record<string, unknown> = {};
  for (const row of ledger.memoryValuesResolved) Object.assign(flat, row.value);

  const channel = channelForFormat(input.format);
  const memoryRetrieved = ledger.memoryIdsUsed.length > 0;
  const preferenceApplied =
    contentOverlay.preferenceKeys.length > 0 && next !== input.content.trim();
  const applied =
    memoryRetrieved || Boolean(overlay.brand) || preferenceApplied;
  const quality = compareMemoryQuality({
    before: input.content,
    after: next,
    memoryMode: applied ? "on" : "off",
    expectedMemoryTokens: expectedTokensFromMemoryValues(flat),
  });

  recordMemoryApplyEvent({
    userId: input.userId,
    channel,
    memoryMode: applied ? "on" : "off",
    applied,
    memoryRetrieved,
    memoryApplied: applied && next !== input.content.trim(),
    memorySource: memoryRetrieved ? "atlasPersonalMemory" : "none",
    appliedPreferenceKeys: contentOverlay.preferenceKeys,
    memoryIdsUsed: ledger.memoryIdsUsed,
    scopesUsed: overlay.scopesUsed,
    improvementRate: quality.improvementRate,
    success: true,
    correlationId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `corr_deliverable_${crypto.randomUUID().slice(0, 8)}`
        : null,
  });

  return {
    content: next,
    overlay,
    memoryIdsUsed: ledger.memoryIdsUsed,
    quality,
    applied,
    channel,
    memoryRetrieved,
    memoryApplied: applied && next !== input.content.trim(),
    appliedPreferenceKeys: contentOverlay.preferenceKeys,
  };
}
