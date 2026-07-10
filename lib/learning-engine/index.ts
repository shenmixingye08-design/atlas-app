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

export {
  fetchLatestLearningReport,
  runLearningAnalysisClient,
  fetchLearningReportHistory,
} from "./client";
