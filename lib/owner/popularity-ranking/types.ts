/** Popularity ranking feature identifiers. */
export type PopularityFeatureId =
  | "sns"
  | "blog"
  | "sales_material"
  | "email"
  | "google"
  | "dropbox"
  | "video"
  | "image";

export type PopularityFeatureDefinition = {
  id: PopularityFeatureId;
  label: string;
};

export type PopularityUsageEvent = {
  featureId: PopularityFeatureId;
  userId: string | null;
  timestamp: string;
};

export type PopularityFeatureMetrics = {
  featureId: PopularityFeatureId;
  label: string;
  activeUsers: number;
  usageCount: number;
  /** Usage count change vs previous month (percentage points). */
  momChangePercent: number | null;
  rank: number;
  isEstimated: boolean;
};

export type PopularityRankingSnapshot = {
  period: {
    month: string;
    monthLabel: string;
    previousMonth: string;
    previousMonthLabel: string;
  };
  rankings: readonly PopularityFeatureMetrics[];
  generatedAt: string;
};
