import type {
  MemoryApplyPreviewItem,
  MemoryResolutionResult,
} from "@/lib/personal-memory/types";
import { SCOPE_LABELS } from "@/lib/personal-memory/labels";

/**
 * Compact pre-generation summary: 「今回は以下の好みを適用します」
 */
export function buildMemoryApplyPreview(
  result: MemoryResolutionResult,
): MemoryApplyPreviewItem[] {
  return result.used.slice(0, 8).map((item) => {
    const body =
      typeof item.value.text === "string"
        ? item.value.text
        : item.summary;
    return {
      scope: item.scope,
      title: item.title || SCOPE_LABELS[item.scope] || item.scope,
      summary: body.slice(0, 80),
      layer: item.layer,
      memoryId: item.memoryId,
    };
  });
}

export function formatApplyPreviewLines(
  items: MemoryApplyPreviewItem[],
): string[] {
  return items.map((item) => `・${item.title}: ${item.summary}`);
}
