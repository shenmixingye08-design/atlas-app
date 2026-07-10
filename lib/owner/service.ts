import "server-only";

import { mockOwnerMetricsProvider } from "./providers/mock-provider";
import type { OwnerMetricsProvider } from "./providers/types";
import type { OwnerDashboardSnapshot } from "./types";

let activeProvider: OwnerMetricsProvider = mockOwnerMetricsProvider;

/** Swap providers when Stripe / OpenAI / server billing adapters are added. */
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
