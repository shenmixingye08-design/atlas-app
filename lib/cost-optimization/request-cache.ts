import { createHash } from "node:crypto";

import type { OrchestrationResult } from "@/lib/orchestration/types";

import type { AutomationExecutionMode } from "./execution-mode";

type CachedRun = {
  result: OrchestrationResult;
  cachedAt: string;
  executionMode: AutomationExecutionMode;
};

function getBucket(): Map<string, CachedRun> {
  const globalScope = globalThis as typeof globalThis & {
    __atlasRequestCacheStore?: Map<string, CachedRun>;
  };
  if (!globalScope.__atlasRequestCacheStore) {
    globalScope.__atlasRequestCacheStore = new Map();
  }
  return globalScope.__atlasRequestCacheStore;
}

export function buildRequestCacheKey(
  assignment: string,
  executionMode: AutomationExecutionMode,
): string {
  const normalized = assignment.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256")
    .update(`${executionMode}:${normalized}`)
    .digest("hex");
}

export function getCachedOrchestrationResult(
  key: string,
): OrchestrationResult | null {
  return getBucket().get(key)?.result ?? null;
}

export function setCachedOrchestrationResult(
  key: string,
  result: OrchestrationResult,
  executionMode: AutomationExecutionMode,
): void {
  getBucket().set(key, {
    result,
    cachedAt: new Date().toISOString(),
    executionMode,
  });
}

export function clearRequestCache(): void {
  getBucket().clear();
}
