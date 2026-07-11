import "server-only";

import { liveOwnerMetricsProvider } from "./providers/live-provider";
import type { OwnerMetricsProvider } from "./providers/types";
import type { OwnerDashboardSnapshot } from "./types";

let activeProvider: OwnerMetricsProvider = liveOwnerMetricsProvider;

/** Swap providers when alternate billing adapters are added. */
export function setOwnerMetricsProvider(provider: OwnerMetricsProvider): void {
  activeProvider = provider;
}

export function getOwnerMetricsProvider(): OwnerMetricsProvider {
  return activeProvider;
}

export async function getOwnerDashboardSnapshot(
  now?: Date,
): Promise<OwnerDashboardSnapshot> {
  return activeProvider.getDashboardSnapshot(now);
}
