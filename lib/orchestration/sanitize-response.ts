import { isAtlasServerDebugEnabled } from "@/lib/debug/atlas-debug";

import type { OrchestrationResult } from "./types";

/** Strip dev-only debug fields before sending orchestration results to clients. */
export function sanitizeOrchestrationResultForClient(
  result: OrchestrationResult,
): OrchestrationResult {
  if (isAtlasServerDebugEnabled()) {
    return result;
  }

  const { costDebug: _cost, pipelineDebug: _pipe, isolationDebug: _iso, ...rest } = result;
  return rest;
}
