export type HealthStatus = "excellent" | "good" | "attention";

export type HealthIndicatorId =
  | "quality"
  | "knowledgeGrowth"
  | "automation"
  | "learning"
  | "companyConfidence";

export type HealthIndicator = {
  id: HealthIndicatorId;
  label: string;
  status: HealthStatus;
};

export type DepartmentHighlightId =
  | "ceo"
  | "research"
  | "planner"
  | "worker"
  | "qa"
  | "pr"
  | "growth"
  | "learning";

export type DepartmentHighlight = {
  id: DepartmentHighlightId;
  label: string;
  highlight: string;
};

type ExtensionStub = { enabled: false; note: string };

/** Company-level summary after a completed workflow (presentation only). */
export type CompanyOperationsReport = {
  todayStatus: readonly string[];
  departmentHighlights: readonly DepartmentHighlight[];
  health: readonly HealthIndicator[];
  ceoDailyReport: string;
  extensions: CompanyOperationsExtensions;
};

export type CompanyOperationsExtensions = {
  weeklyReports: ExtensionStub;
  monthlyReports: ExtensionStub;
  businessKpis: ExtensionStub;
  teamPerformance: ExtensionStub;
  realAnalytics: ExtensionStub;
};

export const OPERATIONS_EXTENSION_STUBS: CompanyOperationsExtensions = {
  weeklyReports: { enabled: false, note: "週次レポート（将来対応）" },
  monthlyReports: { enabled: false, note: "月次レポート（将来対応）" },
  businessKpis: { enabled: false, note: "ビジネスKPI（将来対応）" },
  teamPerformance: { enabled: false, note: "チームパフォーマンス（将来対応）" },
  realAnalytics: { enabled: false, note: "実アナリティクス（将来対応）" },
};

export const HEALTH_STATUS_ORDER: Record<HealthStatus, number> = {
  excellent: 3,
  good: 2,
  attention: 1,
};
