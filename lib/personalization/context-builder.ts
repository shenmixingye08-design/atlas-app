import { resolveMemoryPriority } from "@/lib/personalization/priority";
import type {
  PersonalizationContext,
  ProductionMemoryRecord,
  WritingStylePrefs,
} from "@/lib/personalization/types";

export type BuildContextInput = {
  ownerId: string;
  memories: ProductionMemoryRecord[];
  explicitOverrides?: Record<string, unknown> | null;
  automationId?: string | null;
  templateId?: string | null;
  companyId?: string | null;
  category?: string | null;
  artifactType?: string | null;
  systemDefaults?: Record<string, unknown> | null;
  /** Keys the user asked to skip this run */
  skipMemoryIds?: readonly string[] | null;
  /** Disable memory entirely for this build */
  memoryEnabled?: boolean;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function previewForKey(key: string, value: unknown): string | null {
  const text =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "text" in value
        ? String((value as { text: unknown }).text)
        : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value ?? "");

  switch (key) {
    case "verbosity":
      return value === "short"
        ? "文章は短め"
        : value === "long"
          ? "文章は詳しめ"
          : null;
    case "tone":
      return value === "formal"
        ? "文体はフォーマル"
        : value === "polite"
          ? "丁寧な文体"
          : value === "casual"
            ? "カジュアルな文体"
            : null;
    case "bulletUsage":
      return value === "prefer" ? "箇条書き中心" : null;
    case "headingDensity":
      return value === "high" ? "見出しを多め" : null;
    case "colorPalette":
    case "primaryColor":
      return text.includes("blue") || text.includes("青")
        ? "配色は青系"
        : text
          ? `配色の好みを反映`
          : null;
    case "aspectRatio":
      return value === "16:9"
        ? "PowerPointは16:9"
        : value === "4:3"
          ? "PowerPointは4:3"
          : null;
    case "alsoGeneratePdf":
      return value === true ? "PDFも同時生成" : null;
    case "fileNamePattern":
      return text ? `ファイル名規則を反映` : null;
    case "freezePane":
      return value === true ? "Excelのウィンドウ枠固定" : null;
    case "autoFilter":
      return value === true ? "Excelのフィルター" : null;
    default:
      if (text.length > 0 && text.length < 40) return text;
      return null;
  }
}

export function buildPersonalizationContext(
  input: BuildContextInput,
): PersonalizationContext {
  if (input.memoryEnabled === false) {
    return {
      writingStyle: {},
      structure: {},
      visualStyle: {},
      artifactPreferences: {},
      deliveryPreferences: {},
      approvalPreferences: {},
      appliedMemoryIds: [],
      ignoredMemoryIds: input.memories.map((m) => m.memoryId),
      conflicts: [],
      explicitOverrides: { ...(input.explicitOverrides ?? {}) },
      previewLines: [],
      requiresConfirmation: false,
    };
  }

  const skip = new Set(input.skipMemoryIds ?? []);
  const memories = input.memories.filter((m) => !skip.has(m.memoryId));

  const priority = resolveMemoryPriority({
    ownerId: input.ownerId,
    memories,
    explicitOverrides: input.explicitOverrides,
    automationId: input.automationId,
    templateId: input.templateId,
    companyId: input.companyId,
    category: input.category,
    artifactType: input.artifactType,
    systemDefaults: input.systemDefaults,
  });

  const v = priority.values;
  const writingStyle: WritingStylePrefs = {
    tone: asString(v.tone) as WritingStylePrefs["tone"],
    politeness: asString(v.politeness) as WritingStylePrefs["politeness"],
    verbosity: asString(v.verbosity) as WritingStylePrefs["verbosity"],
    sentenceLength: asString(
      v.sentenceLength,
    ) as WritingStylePrefs["sentenceLength"],
    bulletUsage: asString(v.bulletUsage) as WritingStylePrefs["bulletUsage"],
    headingDensity: asString(
      v.headingDensity,
    ) as WritingStylePrefs["headingDensity"],
    terminology:
      v.terminology && typeof v.terminology === "object"
        ? (v.terminology as Record<string, string>)
        : undefined,
  };

  const previewLines: string[] = [];
  for (const entry of priority.resolved) {
    if (entry.layer === "explicit" || entry.layer === "system_default") continue;
    const line = previewForKey(entry.key, entry.value);
    if (line && !previewLines.includes(line)) previewLines.push(line);
  }

  return {
    writingStyle,
    structure: {
      headingStyle: asString(v.headingStyle) as
        | "numbered"
        | "plain"
        | "question"
        | undefined,
      maxSections: asNumber(v.maxSections),
      pageLayout: asString(v.pageLayout) as
        | "compact"
        | "standard"
        | "spacious"
        | undefined,
      sectionOrder: Array.isArray(v.sectionOrder)
        ? (v.sectionOrder as string[])
        : undefined,
    },
    visualStyle: {
      colorPalette: asString(v.colorPalette) as
        | "blue"
        | "red"
        | "green"
        | "mono"
        | "brand"
        | undefined,
      primaryColor: asString(v.primaryColor),
      accentColor: asString(v.accentColor),
      fontFamily: asString(v.fontFamily),
      marginsMm: asNumber(v.marginsMm),
      aspectRatio: asString(v.aspectRatio) as "16:9" | "4:3" | undefined,
      freezePane: asBool(v.freezePane),
      autoFilter: asBool(v.autoFilter),
      headerFooter: asBool(v.headerFooter),
    },
    artifactPreferences: {
      preferredFormats: Array.isArray(v.preferredFormats)
        ? (v.preferredFormats as string[])
        : undefined,
      columnOrder: Array.isArray(v.columnOrder)
        ? (v.columnOrder as string[])
        : undefined,
      dateFormat: asString(v.dateFormat),
      currencyFormat: asString(v.currencyFormat),
      chartEnabled: asBool(v.chartEnabled),
      maxSlides: asNumber(v.maxSlides),
      ocrNormalize:
        v.ocrNormalize && typeof v.ocrNormalize === "object"
          ? (v.ocrNormalize as NonNullable<
              PersonalizationContext["artifactPreferences"]["ocrNormalize"]
            >)
          : undefined,
    },
    deliveryPreferences: {
      fileNamePattern: asString(v.fileNamePattern),
      saveDestination: asString(v.saveDestination),
      alsoGeneratePdf: asBool(v.alsoGeneratePdf),
      notificationPreference: asString(v.notificationPreference) as
        | "silent"
        | "normal"
        | "verbose"
        | undefined,
    },
    approvalPreferences: {
      requireApproval: asBool(v.requireApproval),
      skipApproval: asBool(v.skipApproval),
      autoSendExternal: asBool(v.autoSendExternal),
    },
    appliedMemoryIds: priority.appliedMemoryIds,
    ignoredMemoryIds: [
      ...priority.ignoredMemoryIds,
      ...[...skip],
    ],
    conflicts: priority.conflicts,
    explicitOverrides: { ...(input.explicitOverrides ?? {}) },
    previewLines: previewLines.slice(0, 8),
    requiresConfirmation: priority.requiresConfirmation,
  };
}

/** Compact structured payload for planner / generator — not a prose dump. */
export function toPlannerPersonalizationPayload(
  context: PersonalizationContext,
): Record<string, unknown> {
  return {
    writingStyle: context.writingStyle,
    structure: context.structure,
    visualStyle: context.visualStyle,
    artifactPreferences: context.artifactPreferences,
    deliveryPreferences: context.deliveryPreferences,
    approvalPreferences: context.approvalPreferences,
    appliedMemoryIds: context.appliedMemoryIds,
    conflicts: context.conflicts.map((c) => ({
      key: c.key,
      resolution: c.resolution,
    })),
    explicitOverrides: context.explicitOverrides,
  };
}
