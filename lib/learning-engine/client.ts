import type {
  LearningAnalysisPeriod,
  LearningReport,
} from "./types";

export type {
  LearningAnalysisPeriod,
  LearningDomain,
  LearningEvent,
  LearningInsightItem,
  LearningReport,
  LearningReportSections,
} from "./types";

export { LEARNING_ANALYSIS_PERIODS, LEARNING_DOMAINS } from "./types";
export { getLearningDomainLabel, LEARNING_DOMAIN_LABELS } from "./domains";

export async function fetchLatestLearningReport(
  periodDays: LearningAnalysisPeriod,
): Promise<LearningReport | null> {
  const response = await fetch(
    `/api/learning-engine/report?periodDays=${periodDays}`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Failed to load learning report");
  const payload = (await response.json()) as { report: LearningReport | null };
  return payload.report;
}

export async function runLearningAnalysisClient(
  periodDays: LearningAnalysisPeriod,
): Promise<LearningReport> {
  const response = await fetch("/api/learning-engine/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ periodDays }),
  });
  if (!response.ok) throw new Error("Failed to run learning analysis");
  const payload = (await response.json()) as { report: LearningReport };
  return payload.report;
}

export async function fetchLearningReportHistory(): Promise<LearningReport[]> {
  const response = await fetch("/api/learning-engine/reports", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load report history");
  const payload = (await response.json()) as { reports: LearningReport[] };
  return payload.reports;
}
