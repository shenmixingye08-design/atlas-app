/** External API providers tracked on the owner console. */
export type ApiUsageProviderId =
  | "openai"
  | "google"
  | "stripe"
  | "x"
  | "wordpress";

export type ApiUsageWarningLevel = "none" | "approaching" | "critical";

export type ApiUsageRecordSource =
  | "orchestration"
  | "automation"
  | "webhook"
  | "external"
  | "estimate";

export type ApiUsageRecord = {
  providerId: ApiUsageProviderId;
  amountUsd: number;
  timestamp: string;
  source: ApiUsageRecordSource;
};

export type ApiUsageProviderSnapshot = {
  providerId: ApiUsageProviderId;
  label: string;
  todayUsd: number;
  monthUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  usagePercent: number;
  warningLevel: ApiUsageWarningLevel;
  isEstimated: boolean;
};

export type ApiUsageWarning = {
  providerId: ApiUsageProviderId;
  level: Exclude<ApiUsageWarningLevel, "none">;
  message: string;
};

export type ApiUsageMonitoringSnapshot = {
  period: {
    month: string;
    monthLabel: string;
    day: string;
  };
  providers: readonly ApiUsageProviderSnapshot[];
  warnings: readonly ApiUsageWarning[];
  generatedAt: string;
};
