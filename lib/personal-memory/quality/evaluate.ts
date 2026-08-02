import { buildMemoryApplyPreview } from "@/lib/personal-memory/apply-preview";
import { schedulePersistPersonalMemory } from "@/lib/personal-memory/durable";
import { resolvePersonalMemories } from "@/lib/personal-memory/resolve";
import {
  listStoredPersonalMemories,
  readPersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { computeCorrectionMetrics } from "@/lib/personal-memory/quality/diff-metrics";
import {
  averageMatchRate,
  computeMatchRates,
} from "@/lib/personal-memory/quality/match-rate";
import { computeMemoryScore } from "@/lib/personal-memory/quality/memory-score";
import {
  listQualityEvaluations,
  upsertQualityEvaluation,
} from "@/lib/personal-memory/quality/store";
import type {
  DeliverableKind,
  DeliverableQualityEvaluation,
  MemoryApplyBreakdown,
} from "@/lib/personal-memory/quality/types";
import type { MemoryApplyPreviewItem } from "@/lib/personal-memory/types";

export type EvaluateDeliverableQualityInput = {
  userId: string;
  before: string;
  after: string;
  deliverableKind?: DeliverableKind | null;
  artifactType?: string | null;
  workCategory?: string | null;
  companyId?: string | null;
  automationId?: string | null;
  templateId?: string | null;
  /** When provided, skip re-resolve (e.g. from a prior run ledger). */
  appliedPreview?: MemoryApplyPreviewItem[];
  memoryIdsUsed?: string[];
};

const MATCH_DIMENSION_COUNT = 7;

export function inferDeliverableKind(
  artifactType?: string | null,
): DeliverableKind {
  const t = (artifactType ?? "").toLowerCase();
  if (!t) return "unknown";
  if (t.includes("word") || t.includes("docx") || t === "doc") return "word";
  if (t.includes("excel") || t.includes("xlsx") || t.includes("sheet")) {
    return "excel";
  }
  if (
    t.includes("powerpoint") ||
    t.includes("pptx") ||
    t.includes("slide") ||
    t.includes("ppt")
  ) {
    return "powerpoint";
  }
  if (t.includes("pdf")) return "pdf";
  if (t.includes("ocr")) return "ocr";
  if (t.includes("image") || t.includes("png") || t.includes("jpg")) {
    return "image";
  }
  if (t.includes("text") || t.includes("markdown")) return "text";
  return "unknown";
}

/** Split "powerpoint+pdf" / "word,pdf" into discrete artifact tokens for resolve. */
export function expandArtifactTypes(
  artifactType?: string | null,
): string[] | null {
  if (!artifactType?.trim()) return null;
  const parts = artifactType
    .toLowerCase()
    .split(/[+/,|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [artifactType.toLowerCase()];
}

function classifyApplyBreakdown(
  items: MemoryApplyPreviewItem[],
  memoriesById: Map<string, { appliesTo: {
    automationIds: string[];
    companyIds: string[];
    workCategories: string[];
    templateIds: string[];
    artifactTypes: string[];
    global: boolean;
  } }>,
): MemoryApplyBreakdown {
  let byCategory = 0;
  let byAutomation = 0;
  let byCompany = 0;
  let byArtifact = 0;
  let byGlobal = 0;

  for (const item of items) {
    const id = item.memoryId;
    const mem = id ? memoriesById.get(id) : undefined;
    if (!mem) {
      if (item.layer === "deliverable_category") byCategory += 1;
      else if (item.layer === "automation_memory") byAutomation += 1;
      else if (item.layer === "company_memory") byCompany += 1;
      else byGlobal += 1;
      continue;
    }
    const a = mem.appliesTo;
    if (a.automationIds.length > 0) byAutomation += 1;
    else if (a.workCategories.length > 0) byCategory += 1;
    else if (a.companyIds.length > 0) byCompany += 1;
    else if (a.templateIds.length > 0 || a.artifactTypes.length > 0) {
      byArtifact += 1;
    } else byGlobal += 1;
  }

  return {
    totalApplied: items.length,
    byCategory,
    byAutomation,
    byCompany,
    byArtifact,
    byGlobal,
  };
}

/**
 * Record a deliverable quality evaluation after user correction.
 * Proves Memory impact via Memory Score + Diff rate — not mere presence.
 */
export function evaluateDeliverableQuality(
  input: EvaluateDeliverableQualityInput,
): DeliverableQualityEvaluation {
  const settings = readPersonalMemorySettings(input.userId);
  const memories = listStoredPersonalMemories(input.userId);
  const memoriesById = new Map(memories.map((m) => [m.id, m]));

  let appliedPreview = input.appliedPreview;
  let memoryIdsUsed = input.memoryIdsUsed ?? [];

  if (!appliedPreview) {
    const resolved = resolvePersonalMemories({
      userId: input.userId,
      settings,
      memories,
      automationId: input.automationId,
      artifactTypes: expandArtifactTypes(input.artifactType),
      workCategory: input.workCategory,
      companyId: input.companyId,
      templateId: input.templateId,
    });
    appliedPreview = buildMemoryApplyPreview(resolved);
    memoryIdsUsed = resolved.used.map((u) => u.memoryId);
  }

  const correction = computeCorrectionMetrics(input.before, input.after);
  const matchRates = computeMatchRates({
    correctedText: input.after,
    applied: appliedPreview,
    artifactType: input.artifactType,
  });
  const overallMatchRate = averageMatchRate(matchRates);
  const nonNullDims = Object.values(matchRates).filter(
    (v): v is number => typeof v === "number",
  ).length;
  const applyCoverage = nonNullDims / MATCH_DIMENSION_COUNT;

  const memoryScore = computeMemoryScore({
    overallMatchRate,
    correction,
    applyCoverage,
  });

  const kind =
    input.deliverableKind ?? inferDeliverableKind(input.artifactType);
  const categoryKey = input.workCategory?.trim() || null;
  const priorInCategory = listQualityEvaluations(input.userId).filter(
    (e) => (e.workCategory?.trim() || null) === categoryKey,
  );
  const runIndexInCategory = priorInCategory.length + 1;

  const appliedConfidence =
    memoryIdsUsed.length === 0
      ? 0
      : memoryIdsUsed.reduce((sum, id) => {
          const m = memoriesById.get(id);
          return sum + (m?.confidence ?? 0);
        }, 0) / memoryIdsUsed.length;

  const evaluation: DeliverableQualityEvaluation = {
    id: `mqe_${Date.now().toString(36)}_${runIndexInCategory}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    // Include run index so same-ms batch evaluations stay ordered.
    createdAt: new Date(Date.now() + runIndexInCategory).toISOString(),
    deliverableKind: kind,
    workCategory: categoryKey,
    automationId: input.automationId ?? null,
    companyId: input.companyId ?? null,
    generatedText: input.before.slice(0, 4000),
    correctedText: input.after.slice(0, 4000),
    memoryApplied: classifyApplyBreakdown(appliedPreview, memoriesById),
    appliedPreview,
    correction,
    matchRates,
    overallMatchRate: Number(overallMatchRate.toFixed(4)),
    memoryScore,
    appliedConfidence: Number(appliedConfidence.toFixed(4)),
    memoryIdsUsed,
    runIndexInCategory,
  };

  upsertQualityEvaluation(evaluation);
  schedulePersistPersonalMemory(input.userId);
  return evaluation;
}
