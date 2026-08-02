import type {
  PredictionHistoryEntry,
  PredictiveQualityKpis,
  ProactiveSuggestion,
} from "@/lib/personal-memory/predict/types";
import type { PersonalMemoryRecord } from "@/lib/personal-memory/types";

/**
 * Proactive suggestions beyond deliverable prefs (Automation / PDF / destination).
 * Deterministic frequency rules — never re-show the same fingerprint.
 */
export function buildProactiveSuggestions(input: {
  memories: PersonalMemoryRecord[];
  history: PredictionHistoryEntry[];
  workCategory?: string | null;
  dismissedFingerprints?: ReadonlySet<string>;
}): ProactiveSuggestion[] {
  const dismissed = input.dismissedFingerprints ?? new Set<string>();
  const out: ProactiveSuggestion[] = [];
  const category = input.workCategory?.trim() || null;

  const fridaySales = category === "営業資料" || category === "sales_deck";
  const pdfMemories = input.memories.filter(
    (m) =>
      (m.status === "active" || m.status === "candidate") &&
      /pdf/i.test(`${m.summary} ${m.title}`),
  );
  const destMemories = input.memories.filter(
    (m) =>
      (m.status === "active" || m.status === "candidate") &&
      (m.scope === "default_storage_locations" ||
        /dropbox|drive|保存/i.test(m.summary)),
  );

  // Pattern: recurring sales deck → suggest automation
  const categoryApplied = input.history.filter(
    (h) =>
      h.workCategory === category &&
      (h.outcome === "accepted" || h.outcome === "edited"),
  ).length;
  if (fridaySales && categoryApplied >= 3) {
    const fingerprint = `automation:${category ?? "sales"}:weekly`;
    if (!dismissed.has(fingerprint)) {
      out.push({
        id: `psug_${fingerprint}`,
        kind: "automation",
        title: "この仕事を自動化しますか？",
        description:
          "最近、営業資料を繰り返し作成しています。毎週の作成を Automation にしますか？",
        fingerprint,
        confidence: Math.min(0.92, 0.55 + categoryApplied * 0.08),
      });
    }
  }

  // Pattern: Word→PDF always → co-generate
  if (pdfMemories.length === 0) {
    const pdfEdits = input.history.filter((h) =>
      /pdf/i.test(`${h.title} ${h.summary}`),
    ).length;
    if (pdfEdits >= 2 || categoryApplied >= 2) {
      const fingerprint = `pdf_co_generate:${category ?? "global"}`;
      if (!dismissed.has(fingerprint)) {
        out.push({
          id: `psug_${fingerprint}`,
          kind: "pdf_co_generate",
          title: "今後は PDF も同時生成しますか？",
          description:
            "最近、毎回 Word→PDF 変換に近い修正・選択が見られます。標準で PDF 同時生成にしますか？",
          fingerprint,
          confidence: 0.78,
        });
      }
    }
  }

  // Pattern: same destination → register as default
  if (destMemories.some((m) => m.status === "candidate")) {
    const dest = destMemories[0]!;
    const fingerprint = `default_destination:${dest.key}`;
    if (!dismissed.has(fingerprint)) {
      out.push({
        id: `psug_${fingerprint}`,
        kind: "default_destination",
        title: "保存先を標準設定へ登録しますか？",
        description: `毎回「${dest.summary}」へ保存しています。正式な標準設定にしますか？`,
        fingerprint,
        confidence: dest.confidence,
      });
    }
  }

  return out.slice(0, 3);
}

export function computePredictiveKpis(input: {
  history: PredictionHistoryEntry[];
  /** From quality evaluations when available */
  averageDiffRateFirst?: number | null;
  averageDiffRateLatest?: number | null;
  averageMatchRate?: number | null;
  predictionsCount: number;
  suggestionShown?: number;
  suggestionAccepted?: number;
}): PredictiveQualityKpis {
  const history = input.history;
  const decided = history.filter((h) => h.outcome !== "edited" || true);
  const accepted = history.filter(
    (h) => h.outcome === "accepted" || h.outcome === "edited",
  );
  const rejected = history.filter(
    (h) => h.outcome === "rejected" || h.outcome === "toggled_off",
  );
  const firstAccept = history.filter((h) => h.outcome === "accepted");

  const predictionAccuracy =
    decided.length === 0
      ? null
      : accepted.length / Math.max(accepted.length + rejected.length, 1);

  const memoryAccuracy = input.averageMatchRate ?? predictionAccuracy;

  const diffReduction =
    input.averageDiffRateFirst != null &&
    input.averageDiffRateLatest != null &&
    input.averageDiffRateFirst > 0
      ? Math.max(
          0,
          (input.averageDiffRateFirst - input.averageDiffRateLatest) /
            input.averageDiffRateFirst,
        )
      : null;

  // Instruction reduction proxy: high auto-accept share
  const instructionReduction =
    history.length === 0
      ? null
      : firstAccept.length / history.length;

  const reuseRate =
    history.length === 0
      ? null
      : new Set(history.map((h) => h.memoryId).filter(Boolean)).size /
        Math.max(history.length, 1);

  const firstAcceptRate =
    history.length === 0 ? null : firstAccept.length / history.length;

  const automationSuggestionRate =
    (input.suggestionShown ?? 0) === 0
      ? null
      : (input.suggestionAccepted ?? 0) /
        Math.max(input.suggestionShown ?? 1, 1);

  return {
    generatedAt: new Date().toISOString(),
    predictionAccuracy,
    memoryAccuracy,
    diffReduction,
    instructionReduction,
    reuseRate,
    firstAcceptRate,
    automationSuggestionRate,
    predictionsCount: input.predictionsCount,
    historyCount: history.length,
  };
}
