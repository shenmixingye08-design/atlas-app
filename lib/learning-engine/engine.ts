import { randomUUID } from "crypto";

import { listStoredWorkMemories } from "@/lib/work-memory/store";
import { buildAssignmentFingerprint } from "@/lib/work-memory/search";
import { sanitizeMemoryText } from "@/lib/work-memory/security";
import type { WorkMemoryType } from "@/lib/work-memory/types";

import {
  buildLearningReportSections,
  computeLearningSummary,
  countDataPoints,
  filterMemoriesForLearning,
  hasSufficientLearningData,
} from "./analytics";
import { inferLearningDomain } from "./domains";
import { schedulePersistLearning } from "./durable";
import {
  appendLearningEvent,
  appendLearningReport,
  findLatestLearningReport,
  listLearningEventsInRange,
  listLearningReports,
} from "./store";
import type {
  LearningAnalysisPeriod,
  LearningEvent,
  LearningReport,
  RunLearningAnalysisInput,
} from "./types";
import { LEARNING_ANALYSIS_PERIODS } from "./types";

const INSUFFICIENT_MESSAGE = "十分な学習データがありません。";

function periodBounds(
  periodDays: LearningAnalysisPeriod,
  endAt: Date,
): { start: string; end: string } {
  const end = endAt.toISOString();
  const startDate = new Date(endAt);
  startDate.setDate(startDate.getDate() - periodDays);
  return { start: startDate.toISOString(), end };
}

function emptySections() {
  return {
    improvements: [],
    maintain: [],
    recommendations: [],
    futureProposals: [],
  };
}

export function buildAnalysisDataset(
  userId: string,
  periodDays: LearningAnalysisPeriod,
  endAt: Date = new Date(),
) {
  const { start, end } = periodBounds(periodDays, endAt);
  const events = listLearningEventsInRange(userId, start, end);
  const memories = filterMemoriesForLearning(
    listStoredWorkMemories(userId),
    start,
    end,
  );

  return {
    periodDays,
    periodStart: start,
    periodEnd: end,
    events,
    memories,
  };
}

export function runLearningAnalysis(
  userId: string,
  input: RunLearningAnalysisInput,
): LearningReport {
  if (!LEARNING_ANALYSIS_PERIODS.includes(input.periodDays)) {
    throw new Error("Invalid analysis period");
  }

  const endAt = input.requestedAt ? new Date(input.requestedAt) : new Date();
  const dataset = buildAnalysisDataset(userId, input.periodDays, endAt);
  const sufficient = hasSufficientLearningData(dataset);
  const dataPoints = countDataPoints(dataset);

  const report: LearningReport = {
    reportId: `lr_${randomUUID()}`,
    userId,
    periodDays: input.periodDays,
    periodStart: dataset.periodStart,
    periodEnd: dataset.periodEnd,
    generatedAt: endAt.toISOString(),
    hasSufficientData: sufficient,
    dataPoints,
    insufficientMessage: sufficient ? null : INSUFFICIENT_MESSAGE,
    sections: sufficient ? buildLearningReportSections(dataset) : emptySections(),
    summary: computeLearningSummary(dataset),
  };

  appendLearningReport(userId, report);
  schedulePersistLearning(userId);
  return report;
}

export function getLatestLearningReport(
  userId: string,
  periodDays: LearningAnalysisPeriod,
): LearningReport | null {
  return findLatestLearningReport(userId, periodDays);
}

export function listUserLearningReports(userId: string): LearningReport[] {
  return listLearningReports(userId);
}

/** Record a learning event after job completion — no analysis. */
export function recordLearningEventFromOrchestration(input: {
  userId: string;
  assignment: string;
  deliverableType?: string | null;
  durationMs?: number | null;
  memoriesUsedCount?: number;
  memoryTypesUsed?: WorkMemoryType[];
  correctionApplied?: boolean;
  completed?: boolean;
}): LearningEvent {
  const summary =
    sanitizeMemoryText(input.assignment.slice(0, 160)) ??
    input.assignment.slice(0, 80);

  const event: LearningEvent = {
    eventId: `le_${randomUUID()}`,
    userId: input.userId,
    domain: inferLearningDomain({
      assignment: input.assignment,
      deliverableType: input.deliverableType,
    }),
    assignmentFingerprint: buildAssignmentFingerprint(input.assignment),
    assignmentSummary: summary,
    deliverableType: input.deliverableType ?? null,
    durationMs: input.durationMs ?? null,
    memoriesUsedCount: input.memoriesUsedCount ?? 0,
    memoryTypesUsed: input.memoryTypesUsed ?? [],
    correctionApplied: input.correctionApplied ?? false,
    completed: input.completed ?? true,
    createdAt: new Date().toISOString(),
  };

  const saved = appendLearningEvent(input.userId, event);
  schedulePersistLearning(input.userId);
  return saved;
}

export { INSUFFICIENT_MESSAGE };
