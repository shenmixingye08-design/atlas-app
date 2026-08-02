import { buildMemoryApplyPreview } from "@/lib/personal-memory/apply-preview";
import {
  buildEvidenceSummary,
  buildPredictionHeadline,
  explainPrediction,
} from "@/lib/personal-memory/predict/explain";
import {
  buildProactiveSuggestions,
  computePredictiveKpis,
} from "@/lib/personal-memory/predict/proactive";
import {
  computePredictionScore,
  overallPredictionFromItems,
} from "@/lib/personal-memory/predict/score";
import {
  appendPredictionHistory,
  bumpSuggestionShown,
  getDismissedSuggestionFingerprints,
  getSuggestionCounters,
  listPredictionHistory,
  listPredictionPreviews,
  savePredictionPreview,
  updatePredictionPreview,
} from "@/lib/personal-memory/predict/store";
import type {
  PredictedMemoryItem,
  PredictiveApplyPreview,
  PredictiveMemoryDashboard,
  PredictionHistoryEntry,
} from "@/lib/personal-memory/predict/types";
import { resolvePersonalMemories } from "@/lib/personal-memory/resolve";
import {
  findStoredPersonalMemory,
  listStoredPersonalMemories,
  readPersonalMemorySettings,
} from "@/lib/personal-memory/store";
import type { ResolveMemoryInput } from "@/lib/personal-memory/resolve";
import { listQualityEvaluations } from "@/lib/personal-memory/quality/store";

export type PredictMemoriesInput = {
  userId: string;
  notes?: string | null;
  workCategory?: string | null;
  companyId?: string | null;
  automationId?: string | null;
  templateId?: string | null;
  artifactTypes?: readonly string[] | null;
  sessionDisabledIds?: readonly string[] | null;
  currentInstruction?: Record<string, unknown> | null;
  /** Previously toggled-off memory ids for this draft */
  disabledMemoryIds?: readonly string[] | null;
};

function evidenceForMemory(
  memoryId: string | null,
  memories: ReturnType<typeof listStoredPersonalMemories>,
  workCategory: string | null,
): { count: number; total: number; rejectionCount: number } {
  if (!memoryId) {
    return { count: 0, total: 0, rejectionCount: 0 };
  }
  const memory = memories.find((m) => m.id === memoryId);
  if (!memory) return { count: 0, total: 0, rejectionCount: 0 };

  const correctionEvidence = memory.evidence.filter(
    (e) => e.kind === "correction" || e.kind === "run" || e.kind === "manual",
  );
  const count = Math.max(correctionEvidence.length, memory.status === "active" ? 3 : 1);

  const sameCategory = memories.filter((m) => {
    if (m.scope !== memory.scope) return false;
    if (!workCategory) return true;
    return (
      m.appliesTo.workCategories.length === 0 ||
      m.appliesTo.workCategories.includes(workCategory)
    );
  });
  const total = Math.max(sameCategory.length * 2, count, 5);

  const rejectionCount =
    memory.status === "rejected"
      ? 3
      : memory.rejectedReason
        ? 1
        : 0;

  return { count, total, rejectionCount };
}

/**
 * Predict which Memories to apply before generation.
 * Priority is enforced by resolvePersonalMemories; this layer scores + explains.
 */
export function predictMemoriesForContext(
  input: PredictMemoriesInput,
): PredictiveApplyPreview {
  const settings = readPersonalMemorySettings(input.userId);
  const memories = listStoredPersonalMemories(input.userId);
  const disabled = new Set(input.disabledMemoryIds ?? []);

  const resolveInput: ResolveMemoryInput = {
    userId: input.userId,
    settings,
    memories,
    notes: input.notes,
    workCategory: input.workCategory,
    companyId: input.companyId,
    automationId: input.automationId,
    templateId: input.templateId,
    artifactTypes: input.artifactTypes,
    sessionDisabledIds: input.sessionDisabledIds,
    currentInstruction: input.currentInstruction,
  };

  const resolved = resolvePersonalMemories(resolveInput);
  const basePreview = buildMemoryApplyPreview(resolved);
  const workCategory = input.workCategory ?? null;

  const items: PredictedMemoryItem[] = basePreview.map((item) => {
    const memory = item.memoryId
      ? findStoredPersonalMemory(input.userId, item.memoryId)
      : null;
    const evidence = evidenceForMemory(item.memoryId, memories, workCategory);
    const prediction = computePredictionScore({
      layer: item.layer,
      confidence: memory?.confidence ?? 0.5,
      evidenceCount: evidence.count,
      evidenceTotal: evidence.total,
      rejectionCount: evidence.rejectionCount,
      fromCurrentInstruction: item.layer === "current_instruction",
    });
    const enabled =
      Boolean(item.memoryId) &&
      !disabled.has(item.memoryId!) &&
      prediction.autoApply;
    const requiresConfirm = !prediction.autoApply;

    return {
      memoryId: item.memoryId,
      scope: item.scope,
      title: item.title,
      summary: item.summary,
      layer: item.layer,
      confidence: memory?.confidence ?? 0.5,
      prediction,
      explain: memory
        ? explainPrediction({
            memory,
            layer: item.layer,
            evidenceCount: evidence.count,
            evidenceTotal: evidence.total,
            workCategory,
          })
        : `「${item.title}」を候補として提示します。`,
      evidenceCount: evidence.count,
      evidenceTotal: evidence.total,
      // One-Click: low score items appear unchecked (confirm required)
      enabled: prediction.autoApply ? enabled : false,
      requiresConfirm,
    };
  });

  // Also surface active memories that resolve skipped due to low relevance?
  // Stick to resolved set — avoid unexplained applications.

  const autoApplyItems = items.filter((i) => i.enabled && i.prediction.autoApply);
  const confirmItems = items.filter((i) => i.requiresConfirm || !i.enabled);

  const overallPrediction = overallPredictionFromItems(
    autoApplyItems.length > 0
      ? autoApplyItems.map((i) => i.prediction.score)
      : items.map((i) => i.prediction.score),
  );

  // Estimated match rate blends prediction scores of enabled items
  const estimatedMatchRate =
    autoApplyItems.length === 0
      ? 0
      : autoApplyItems.reduce((s, i) => s + i.prediction.score, 0) /
        autoApplyItems.length /
        100;

  const history = listPredictionHistory(input.userId);
  const proactiveSuggestions = buildProactiveSuggestions({
    memories,
    history,
    workCategory,
    dismissedFingerprints: getDismissedSuggestionFingerprints(input.userId),
  });
  if (proactiveSuggestions.length > 0) {
    bumpSuggestionShown(input.userId, proactiveSuggestions.length);
  }

  const evidenceTotal = Math.max(
    ...items.map((i) => i.evidenceTotal),
    history.filter((h) => h.workCategory === workCategory).length,
    0,
  );

  const injectionLines = autoApplyItems.map(
    (i) => `・${i.title}: ${i.summary}`,
  );
  const injectionText =
    injectionLines.length > 0
      ? `【先回り適用する好み】\n${injectionLines.join("\n")}`
      : "";

  const preview: PredictiveApplyPreview = {
    id: `pred_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    userId: input.userId,
    workCategory,
    companyId: input.companyId ?? null,
    automationId: input.automationId ?? null,
    headline: buildPredictionHeadline({
      workCategory,
      notes: input.notes,
    }),
    evidenceSummary: buildEvidenceSummary({
      workCategory,
      evidenceTotal,
      autoApplyCount: autoApplyItems.length,
    }),
    items,
    autoApplyItems,
    confirmItems,
    overallPrediction,
    estimatedMatchRate: Number(estimatedMatchRate.toFixed(4)),
    proactiveSuggestions,
    injectionText,
  };

  savePredictionPreview(preview);
  return preview;
}

export function togglePredictedMemory(input: {
  userId: string;
  predictionId: string;
  memoryId: string;
  enabled: boolean;
}): PredictiveApplyPreview | null {
  const preview = listPredictionPreviews(input.userId).find(
    (p) => p.id === input.predictionId,
  );
  if (!preview) return null;

  const items = preview.items.map((item) => {
    if (item.memoryId !== input.memoryId) return item;
    // Still block enabling when score < 60 unless user explicitly enables
    // (One-Click allows explicit enable even below threshold — treated as confirm)
    const enabled = input.enabled;
    const requiresConfirm = !item.prediction.autoApply;
    return { ...item, enabled, requiresConfirm };
  });

  const autoApplyItems = items.filter((i) => i.enabled);
  const confirmItems = items.filter((i) => !i.enabled || i.requiresConfirm);
  const overallPrediction = overallPredictionFromItems(
    autoApplyItems.map((i) => i.prediction.score),
  );
  const estimatedMatchRate =
    autoApplyItems.length === 0
      ? 0
      : autoApplyItems.reduce((s, i) => s + i.prediction.score, 0) /
        autoApplyItems.length /
        100;
  const injectionText =
    autoApplyItems.length > 0
      ? `【先回り適用する好み】\n${autoApplyItems
          .map((i) => `・${i.title}: ${i.summary}`)
          .join("\n")}`
      : "";

  return updatePredictionPreview({
    ...preview,
    items,
    autoApplyItems,
    confirmItems,
    overallPrediction,
    estimatedMatchRate: Number(estimatedMatchRate.toFixed(4)),
    injectionText,
  });
}

export function buildPredictiveDashboard(
  userId: string,
): PredictiveMemoryDashboard {
  const previews = listPredictionPreviews(userId);
  const history = listPredictionHistory(userId);
  const latest = previews[0] ?? null;
  const counters = getSuggestionCounters(userId);

  const accepted = history.filter(
    (h) => h.outcome === "accepted" || h.outcome === "edited",
  );
  const rejected = history.filter(
    (h) => h.outcome === "rejected" || h.outcome === "toggled_off",
  );
  const predictionSuccessRate =
    accepted.length + rejected.length === 0
      ? null
      : accepted.length / (accepted.length + rejected.length);

  const evaluations = listQualityEvaluations(userId).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const firstDiff = evaluations[0]?.correction.diffRate ?? null;
  const latestDiff =
    evaluations[evaluations.length - 1]?.correction.diffRate ?? null;
  const avgMatch =
    evaluations.length === 0
      ? null
      : evaluations.reduce((s, e) => s + e.overallMatchRate, 0) /
        evaluations.length;

  const kpis = computePredictiveKpis({
    history,
    averageDiffRateFirst: firstDiff,
    averageDiffRateLatest: latestDiff,
    averageMatchRate: avgMatch,
    predictionsCount: previews.length,
    suggestionShown: counters.shown,
    suggestionAccepted: counters.accepted,
  });

  const memories = listStoredPersonalMemories(userId);
  const proactiveSuggestions = buildProactiveSuggestions({
    memories,
    history,
    workCategory: latest?.workCategory,
    dismissedFingerprints: getDismissedSuggestionFingerprints(userId),
  });

  return {
    generatedAt: new Date().toISOString(),
    latestPrediction: latest,
    overallPredictionScore: latest?.overallPrediction ?? null,
    predictionSuccessRate,
    kpis,
    recentApplied: accepted.slice(0, 8),
    recentRejected: rejected.slice(0, 8),
    history: history.slice(0, 30),
    proactiveSuggestions,
  };
}

export function recordPredictionOutcomes(input: {
  userId: string;
  predictionId: string;
  /** memoryId → outcome */
  outcomes: Array<{
    memoryId: string;
    outcome: PredictionHistoryEntry["outcome"];
    enabled: boolean;
  }>;
}): void {
  const preview = listPredictionPreviews(input.userId).find(
    (p) => p.id === input.predictionId,
  );
  if (!preview) return;

  for (const row of input.outcomes) {
    const item = preview.items.find((i) => i.memoryId === row.memoryId);
    if (!item) continue;
    appendPredictionHistory({
      id: `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      userId: input.userId,
      createdAt: new Date().toISOString(),
      workCategory: preview.workCategory,
      predictionId: preview.id,
      memoryId: row.memoryId,
      title: item.title,
      summary: item.summary,
      predictionScore: item.prediction.score,
      outcome: row.outcome,
      enabled: row.enabled,
    });
  }
}
