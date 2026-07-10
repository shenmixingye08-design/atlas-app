import type { LearningInsightItem, LearningReport } from "./types";

export type AnalysisDisplayPeriod = "week" | "month" | "30" | "90";

export const ANALYSIS_DISPLAY_PERIODS: {
  id: AnalysisDisplayPeriod;
  label: string;
  /** Existing Learning Engine period, or null when not yet supported. */
  apiPeriodDays: 30 | 90 | null;
}[] = [
  { id: "week", label: "今週", apiPeriodDays: null },
  { id: "month", label: "今月", apiPeriodDays: null },
  { id: "30", label: "30日", apiPeriodDays: 30 },
  { id: "90", label: "90日", apiPeriodDays: 90 },
];

export type ImprovementEffectKind =
  | "time"
  | "quality"
  | "workload"
  | "automation";

export const IMPROVEMENT_EFFECT_LABELS: Record<ImprovementEffectKind, string> = {
  time: "予想時間短縮",
  quality: "品質向上",
  workload: "作業削減",
  automation: "自動化可能",
};

export type AdviceAction = {
  href: string;
  label: string;
};

export type AdviceCardModel = {
  id: string;
  text: string;
  evidence: string;
  confidence: number;
  section: "improvements" | "maintain" | "recommendations" | "futureProposals";
  effects: ImprovementEffectKind[];
  action: AdviceAction;
};

function inferEffects(
  item: LearningInsightItem,
  section: AdviceCardModel["section"],
): ImprovementEffectKind[] {
  const effects: ImprovementEffectKind[] = [];
  const text = `${item.text} ${item.evidence}`;

  if (/時間|分|短縮|早い|効率/.test(text)) effects.push("time");
  if (/修正|品質|確認|精度|良い/.test(text) || section === "improvements") {
    effects.push("quality");
  }
  if (/回|繰り返し|削減|負担|同じ/.test(text)) effects.push("workload");
  if (/習慣|定期|自動化|テンプレート|手順/.test(text)) {
    effects.push("automation");
  }

  if (effects.length === 0) {
    if (section === "futureProposals") effects.push("automation");
    else if (section === "recommendations") effects.push("workload");
    else effects.push("quality");
  }

  return [...new Set(effects)];
}

function inferAction(item: LearningInsightItem): AdviceAction {
  const text = `${item.text} ${item.evidence}`;
  if (/習慣|定期|自動化/.test(text)) {
    return { href: "/automations?create=1", label: "習慣として任せる" };
  }
  if (/記憶|テンプレート|Work Memory|未確認/.test(text)) {
    return { href: "/settings/work-memory", label: "仕事の記憶を確認" };
  }
  return { href: "/workspace", label: "新しい依頼で試す" };
}

export function buildAdviceCards(report: LearningReport): AdviceCardModel[] {
  const cards: AdviceCardModel[] = [];

  const push = (
    section: AdviceCardModel["section"],
    items: LearningInsightItem[],
  ) => {
    items.forEach((item, index) => {
      cards.push({
        id: `${section}-${index}`,
        text: item.text,
        evidence: item.evidence,
        confidence: item.confidence,
        section,
        effects: inferEffects(item, section),
        action: inferAction(item),
      });
    });
  };

  push("improvements", report.sections.improvements);
  push("recommendations", report.sections.recommendations);
  push("futureProposals", report.sections.futureProposals);
  push("maintain", report.sections.maintain);

  return cards;
}

export type RecommendationBucket = {
  id: "nextMemory" | "automation" | "repeated" | "growing";
  title: string;
  items: LearningInsightItem[];
  emptyHint: string;
};

export function buildRecommendationBuckets(
  report: LearningReport,
): RecommendationBucket[] {
  const automationItems = [
    ...report.sections.recommendations,
    ...report.sections.futureProposals,
  ].filter((item) => /習慣|定期|自動化|テンプレート|手順/.test(item.text));

  const repeatedItems = report.sections.recommendations.filter((item) =>
    /回|繰り返し|最も/.test(item.text),
  );

  const growingItems = report.sections.improvements.filter((item) =>
    /増えて|後半|増加/.test(item.text),
  );

  return [
    {
      id: "nextMemory",
      title: "次に覚える仕事",
      items: report.sections.futureProposals.slice(0, 3),
      emptyHint: "順次対応",
    },
    {
      id: "automation",
      title: "自動化候補",
      items: automationItems.slice(0, 3),
      emptyHint: "順次対応",
    },
    {
      id: "repeated",
      title: "よく繰り返す仕事",
      items: repeatedItems.slice(0, 3),
      emptyHint: "順次対応",
    },
    {
      id: "growing",
      title: "最近増えた仕事",
      items: growingItems.slice(0, 3),
      emptyHint: "順次対応",
    },
  ];
}

export type AnalysisStat = {
  id: string;
  label: string;
  value: string;
  supported: boolean;
};

export function buildAnalysisStats(input: {
  report: LearningReport | null;
  automationEnabledCount: number | null;
  automationTotalCount: number | null;
}): AnalysisStat[] {
  const { report, automationEnabledCount, automationTotalCount } = input;

  const workVolume =
    report != null
      ? `${report.summary.eventCount}`
      : "—";

  let automationRate = "—";
  let automationSupported = false;
  if (
    automationTotalCount != null &&
    automationEnabledCount != null &&
    automationTotalCount > 0
  ) {
    automationRate = `${Math.round(
      (automationEnabledCount / automationTotalCount) * 100,
    )}%`;
    automationSupported = true;
  } else if (automationTotalCount === 0) {
    automationRate = "0%";
    automationSupported = true;
  }

  const improvementCount =
    report != null
      ? String(
          report.sections.improvements.length +
            report.sections.recommendations.length +
            report.sections.futureProposals.length,
        )
      : "—";

  return [
    {
      id: "volume",
      label: "仕事量",
      value: report ? `${workVolume}件` : "—",
      supported: Boolean(report),
    },
    {
      id: "automation",
      label: "自動化率",
      value: automationSupported ? automationRate : "順次対応",
      supported: automationSupported,
    },
    {
      id: "improvements",
      label: "改善数",
      value: report ? `${improvementCount}件` : "—",
      supported: Boolean(report),
    },
    {
      id: "timeSaved",
      label: "時間削減",
      value: "順次対応",
      supported: false,
    },
  ];
}

export function formatAvgDuration(avgDurationMs: number | null): string | null {
  if (avgDurationMs == null || avgDurationMs <= 0) return null;
  const minutes = Math.max(1, Math.round(avgDurationMs / 60_000));
  return `約${minutes}分`;
}
