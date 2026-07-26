export type AssistantPeriod = "day" | "week" | "month";

export type AlertSeverity = "ok" | "watch" | "danger";

export type ManagementAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  metric: string | null;
};

export type ProfitInsight = {
  id: string;
  period: AssistantPeriod;
  statement: string;
  kind: "margin" | "cost" | "revenue" | "deliverable" | "trend";
};

export type CostAnomaly = {
  id: string;
  severity: AlertSeverity;
  category:
    | "api_cost"
    | "vision"
    | "image_generation"
    | "response_bloat"
    | "token_spike"
    | "error_rate";
  title: string;
  detail: string;
  changePercent: number | null;
};

export type HqSimulationRow = {
  planId: string;
  planName: string;
  planPriceJpy: number;
  hqRuns: number;
  estimatedApiCostJpy: number;
  profitJpy: number;
  marginPercent: number;
  isDeficit: boolean;
  summary: string;
};

export type PlanProposal = {
  planId: string;
  planName: string;
  currentPriceJpy: number;
  subscribers: number;
  estimatedMarginPercent: number | null;
  suggestions: readonly string[];
};

export type UserAnalysisInsight = {
  id: string;
  label: string;
  value: string;
  note: string | null;
};

export type QualityInsight = {
  featureId: string;
  label: string;
  avgDurationMs: number | null;
  failureRatePercent: number | null;
  avgCostUsd: number | null;
  generationCount: number;
  qualityFlag: AlertSeverity;
  detail: string;
};

export type ForecastHorizon = "1m" | "3m" | "6m" | "12m";

export type ForecastPoint = {
  horizon: ForecastHorizon;
  label: string;
  revenueJpy: number | null;
  profitJpy: number | null;
  apiCostJpy: number | null;
  users: number | null;
  availability: "ok" | "incomplete" | "empty";
  note: string | null;
};

export type AiSuggestion = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  source: "rules" | "ai";
};

export type ManagementSummary = {
  period: AssistantPeriod;
  bullets: readonly string[];
  narrative: string | null;
  source: "rules" | "ai" | "mixed";
  generatedAt: string;
  cached: boolean;
  aiAvailable: boolean;
  aiSkippedReason: string | null;
};

export type PriceChangeScenario = {
  planId: string;
  planName: string;
  currentPriceJpy: number;
  proposedPriceJpy: number;
  currentMarginPercent: number | null;
  proposedMarginPercent: number | null;
  deltaProfitJpy: number | null;
  summary: string;
};

export type AiAssistantSnapshot = {
  period: AssistantPeriod;
  generatedAt: string;
  summary: ManagementSummary;
  profitInsights: readonly ProfitInsight[];
  anomalies: readonly CostAnomaly[];
  alerts: readonly ManagementAlert[];
  hqSimulations: readonly HqSimulationRow[];
  priceScenarios: readonly PriceChangeScenario[];
  planProposals: readonly PlanProposal[];
  userInsights: readonly UserAnalysisInsight[];
  qualityInsights: readonly QualityInsight[];
  forecasts: readonly ForecastPoint[];
  suggestions: readonly AiSuggestion[];
  factsHash: string;
  dataNotes: readonly string[];
};
