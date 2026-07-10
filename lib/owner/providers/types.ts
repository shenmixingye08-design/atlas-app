import type { OwnerDashboardSnapshot } from "../types";

/** Contract for aggregating owner metrics from external systems. */
export type OwnerMetricsProvider = {
  readonly id: string;
  getDashboardSnapshot(now?: Date): Promise<OwnerDashboardSnapshot>;
};

export type OwnerMetricsProviderRegistry = {
  getActiveProvider(): OwnerMetricsProvider;
};
