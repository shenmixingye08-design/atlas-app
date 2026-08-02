import type { PersonalizationContext } from "@/lib/personalization/types";
import { toPlannerPersonalizationPayload } from "@/lib/personalization/context-builder";

/**
 * Structured personalization for planner metadata.
 * Not a free-form prose dump — typed JSON payload + short preview lines.
 */
export function buildPersonalizationMetadata(
  context: PersonalizationContext,
): Record<string, unknown> {
  const hint = formatPersonalizationForPlanner(context);
  return {
    personalizationContext: toPlannerPersonalizationPayload(context),
    personalizationPreview: context.previewLines,
    personalizationAppliedMemoryIds: context.appliedMemoryIds,
    personalizationRequiresConfirmation: context.requiresConfirmation,
    ...(hint ? { personalizationPlannerHint: hint } : {}),
  };
}

export function readPersonalizationContextFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  const raw = metadata?.personalizationContext;
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return null;
}

export function readPersonalizationPlannerHintFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): string | null {
  const raw = metadata?.personalizationPlannerHint;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/** Compact planner hint — structured keys, not Memory dump. */
export function formatPersonalizationForPlanner(
  context: PersonalizationContext,
): string | null {
  if (context.appliedMemoryIds.length === 0 && context.previewLines.length === 0) {
    return null;
  }
  const lines = [
    "お客様の好み（PersonalizationContext・構造化）:",
    ...context.previewLines.map((line) => `- ${line}`),
    "明示指示がある場合は必ず明示指示を優先すること。",
    `appliedMemoryIds=${context.appliedMemoryIds.join(",") || "none"}`,
  ];
  return lines.join("\n");
}
