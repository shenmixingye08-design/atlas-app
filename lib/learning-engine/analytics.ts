import type { WorkMemoryRecord } from "@/lib/work-memory/types";

import { getLearningDomainLabel } from "./domains";
import type {
  LearningAnalysisPeriod,
  LearningEvent,
  LearningInsightItem,
  LearningReportSections,
} from "./types";
import {
  LEARNING_MEMORY_TYPES,
  MIN_DATA_POINTS_FOR_ANALYSIS,
  MIN_EVENTS_FOR_TREND,
} from "./types";
import type { LearningDomain } from "./types";

export type AnalysisDataset = {
  periodDays: LearningAnalysisPeriod;
  periodStart: string;
  periodEnd: string;
  events: LearningEvent[];
  memories: WorkMemoryRecord[];
};

function inPeriod(iso: string, start: string, end: string): boolean {
  const ts = new Date(iso).getTime();
  return ts >= new Date(start).getTime() && ts <= new Date(end).getTime();
}

export function filterMemoriesForLearning(
  memories: readonly WorkMemoryRecord[],
  periodStart: string,
  periodEnd: string,
): WorkMemoryRecord[] {
  return memories.filter((memory) => {
    if (!memory.isActive) return false;
    if (!LEARNING_MEMORY_TYPES.includes(memory.type)) return false;
    const relevantAt = memory.lastUsedAt ?? memory.updatedAt ?? memory.createdAt;
    return inPeriod(relevantAt, periodStart, periodEnd);
  });
}

export function countDataPoints(dataset: AnalysisDataset): number {
  const memoryIds = new Set(dataset.memories.map((m) => m.id));
  const eventWeight = dataset.events.length;
  const memoryWeight = memoryIds.size;
  return eventWeight + memoryWeight;
}

export function hasSufficientLearningData(dataset: AnalysisDataset): boolean {
  return countDataPoints(dataset) >= MIN_DATA_POINTS_FOR_ANALYSIS;
}

function insight(
  text: string,
  evidence: string,
  confidence: number,
): LearningInsightItem {
  return {
    text,
    evidence,
    confidence: Math.min(1, Math.max(0.3, confidence)),
  };
}

function topByUsage(
  memories: readonly WorkMemoryRecord[],
  types: WorkMemoryRecord["type"][],
): WorkMemoryRecord | null {
  const filtered = memories
    .filter((m) => types.includes(m.type) && m.usageCount > 0)
    .sort((a, b) => b.usageCount - a.usageCount);
  return filtered[0] ?? null;
}

function avgDurationMs(events: readonly LearningEvent[]): number | null {
  const durations = events
    .map((e) => e.durationMs)
    .filter((ms): ms is number => ms != null && ms > 0);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}

function domainFrequency(events: readonly LearningEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.domain, (counts.get(event.domain) ?? 0) + 1);
  }
  return counts;
}

function correctionTrend(events: readonly LearningEvent[]): {
  firstHalf: number;
  secondHalf: number;
} | null {
  if (events.length < MIN_EVENTS_FOR_TREND) return null;
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid).filter((e) => e.correctionApplied).length;
  const secondHalf = sorted.slice(mid).filter((e) => e.correctionApplied).length;
  return { firstHalf, secondHalf };
}

export function buildLearningReportSections(
  dataset: AnalysisDataset,
): LearningReportSections {
  const { events, memories, periodDays } = dataset;
  const improvements: LearningInsightItem[] = [];
  const maintain: LearningInsightItem[] = [];
  const recommendations: LearningInsightItem[] = [];
  const futureProposals: LearningInsightItem[] = [];

  const correctionMemories = memories.filter((m) => m.type === "correction");
  const templateMemories = memories.filter((m) => m.type === "template");
  const workflowMemories = memories.filter((m) => m.type === "workflow");
  const habitMemories = memories.filter((m) => m.type === "habit");
  const outcomeMemories = memories.filter((m) => m.type === "outcome");
  const resultMemories = memories.filter((m) => m.type === "result");

  const topTemplate = topByUsage(memories, ["template"]);
  if (topTemplate && topTemplate.usageCount >= 2) {
    recommendations.push(
      insight(
        `「${topTemplate.title}」が最も利用されています（${topTemplate.usageCount}回）。`,
        `Work Memory（template）id=${topTemplate.id} · usageCount=${topTemplate.usageCount}`,
        topTemplate.isUserConfirmed ? 0.85 : 0.65,
      ),
    );
  }

  const topWorkflow = topByUsage(memories, ["workflow"]);
  if (topWorkflow && topWorkflow.usageCount >= 2) {
    recommendations.push(
      insight(
        `「${topWorkflow.title}」の手順が繰り返し利用されています（${topWorkflow.usageCount}回）。`,
        `Work Memory（workflow）id=${topWorkflow.id} · usageCount=${topWorkflow.usageCount}`,
        topWorkflow.isUserConfirmed ? 0.82 : 0.62,
      ),
    );
  }

  for (const memory of [...templateMemories, ...workflowMemories].filter(
    (m) => m.isUserConfirmed && m.usageCount >= 1,
  )) {
    const correctionForDomain = correctionMemories.filter(
      (c) =>
        c.tags.some((tag) => memory.tags.includes(tag)) ||
        c.summary.includes(memory.title.slice(0, 8)),
    );
    if (correctionForDomain.length <= 1 && memory.usageCount >= 2) {
      maintain.push(
        insight(
          `「${memory.title}」は修正が少なく、${memory.usageCount}回利用されています。`,
          `Work Memory（${memory.type}）id=${memory.id} · 修正関連=${correctionForDomain.length}件`,
          0.78,
        ),
      );
    }
  }

  for (const habit of habitMemories.filter((m) => m.isUserConfirmed)) {
    maintain.push(
      insight(
        `定期作業「${habit.title}」が記録・継続されています。`,
        `Work Memory（habit）id=${habit.id} · summary=${habit.summary.slice(0, 40)}`,
        0.75,
      ),
    );
  }

  const trend = correctionTrend(events);
  if (trend && trend.secondHalf > trend.firstHalf && trend.secondHalf >= 2) {
    improvements.push(
      insight(
        `修正が必要な仕事が期間後半に増えています（前半${trend.firstHalf}件 → 後半${trend.secondHalf}件）。`,
        `Learning Event · correctionApplied · 期間${periodDays}日`,
        0.7,
      ),
    );
  } else if (trend && trend.firstHalf > trend.secondHalf && trend.firstHalf >= 2) {
    maintain.push(
      insight(
        `修正回数が減少傾向にあります（前半${trend.firstHalf}件 → 後半${trend.secondHalf}件）。`,
        `Learning Event · correctionApplied · 期間${periodDays}日`,
        0.72,
      ),
    );
  }

  const avgMs = avgDurationMs(events);
  if (avgMs != null && events.length >= 3) {
    const minutes = Math.max(1, Math.round(avgMs / 60_000));
    recommendations.push(
      insight(
        `この期間の平均作業時間は約${minutes}分です（${events.length}件の記録）。`,
        `Learning Event · durationMs · 平均=${avgMs}ms`,
        0.68,
      ),
    );
  }

  const domainCounts = domainFrequency(events);
  const topDomainEntry = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDomainEntry && topDomainEntry[1] >= 2) {
    recommendations.push(
      insight(
        `「${getLearningDomainLabel(topDomainEntry[0] as LearningDomain)}」が最も多く依頼されています（${topDomainEntry[1]}回）。`,
        `Learning Event · domain=${topDomainEntry[0]} · count=${topDomainEntry[1]}`,
        0.74,
      ),
    );
  }

  const memoryUtilization =
    events.length > 0
      ? events.filter((e) => e.memoriesUsedCount > 0).length / events.length
      : 0;
  if (events.length >= 4 && memoryUtilization >= 0.5) {
    maintain.push(
      insight(
        `過去の記憶を参照した仕事が全体の${Math.round(memoryUtilization * 100)}%を占めています。`,
        `Learning Event · memoriesUsedCount · ${events.filter((e) => e.memoriesUsedCount > 0).length}/${events.length}件`,
        0.66,
      ),
    );
  }

  for (const outcome of outcomeMemories.filter((m) => m.isUserConfirmed)) {
    futureProposals.push(
      insight(
        `成果「${outcome.title}」の記録を次回の判断材料にできます。`,
        `Work Memory（outcome）id=${outcome.id} · ${outcome.summary.slice(0, 60)}`,
        0.65,
      ),
    );
  }

  const unconfirmedTemplates = templateMemories.filter((m) => !m.isUserConfirmed);
  if (unconfirmedTemplates.length > 0 && events.length >= 2) {
    futureProposals.push(
      insight(
        `未確認のテンプレート候補が${unconfirmedTemplates.length}件あります。仕事の記憶画面で確認すると次回から活用しやすくなります。`,
        `Work Memory（template）未確認=${unconfirmedTemplates.length}件`,
        0.6,
      ),
    );
  }

  if (resultMemories.length >= 2) {
    futureProposals.push(
      insight(
        `完成した成果の記録が${resultMemories.length}件あります。同形式の依頼時に参照できます。`,
        `Work Memory（result）count=${resultMemories.length}`,
        0.64,
      ),
    );
  }

  if (correctionMemories.length >= 3) {
    improvements.push(
      insight(
        `修正に関する記憶が${correctionMemories.length}件蓄積されています。仕事の記憶で確認し、次回反映できます。`,
        `Work Memory（correction）count=${correctionMemories.length}`,
        0.67,
      ),
    );
  }

  return {
    improvements: improvements.slice(0, 5),
    maintain: maintain.slice(0, 5),
    recommendations: recommendations.slice(0, 5),
    futureProposals: futureProposals.slice(0, 5),
  };
}

export function computeLearningSummary(dataset: AnalysisDataset) {
  const correctionCount =
    dataset.memories.filter((m) => m.type === "correction").length +
    dataset.events.filter((e) => e.correctionApplied).length;

  return {
    eventCount: dataset.events.length,
    memoryCount: dataset.memories.length,
    correctionCount,
    avgDurationMs: avgDurationMs(dataset.events),
  };
}
