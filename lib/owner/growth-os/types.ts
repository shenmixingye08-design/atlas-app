export type GrowthOsMetricId =
  | "weeklyCompletingUsers"
  | "referralFirstCompletionRate"
  | "paidUsers";

export type GrowthOsMetric = {
  id: GrowthOsMetricId;
  label: string;
  value: number | null;
  unit: "count" | "percent";
  sampleSize: number;
  previousValue: number | null;
  delta: number | null;
};

export type GrowthOsSnapshot = {
  measuredAt: string;
  windowDays: 7;
  metrics: GrowthOsMetric[];
  ruleSummary: string;
};
