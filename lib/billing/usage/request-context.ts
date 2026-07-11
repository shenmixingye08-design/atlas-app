import { AsyncLocalStorage } from "async_hooks";

import type { AiUsageApi } from "./types";

export type AiBillingUsageContext = {
  userId: string;
  api: AiUsageApi;
  feature: string;
  /**
   * When true, `createAtlasResponse` does not auto-record.
   * Used by orchestration so one user-facing run is counted once from the cost meter.
   */
  suppressAutoRecord?: boolean;
};

const storage = new AsyncLocalStorage<AiBillingUsageContext>();

export function runWithAiBillingUsage<T>(
  context: AiBillingUsageContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}

export function getAiBillingUsageContext(): AiBillingUsageContext | undefined {
  return storage.getStore();
}
