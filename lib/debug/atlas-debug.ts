/** Server-side debug gate — attaches inspector payloads to API responses. */
export function isAtlasServerDebugEnabled(): boolean {
  return (
    process.env.ATLAS_DEBUG === "true" ||
    process.env.NEXT_PUBLIC_ATLAS_DEBUG === "true"
  );
}

/** Client-side debug gate — renders the developer inspector panel and raw deliverable JSON. */
export function isAtlasClientDebugEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ATLAS_DEBUG === "true" ||
    process.env.ATLAS_DEBUG === "true"
  );
}

/** Verbose content logging (full text) — default shows lengths only. */
export function isAtlasDebugVerboseEnabled(): boolean {
  return (
    process.env.ATLAS_DEBUG_VERBOSE === "true" ||
    process.env.NEXT_PUBLIC_ATLAS_DEBUG_VERBOSE === "true"
  );
}

/** Whether orchestration result includes dev inspector payloads from the server. */
export function orchestrationHasInspectorPayload(result: {
  costDebug?: unknown;
  pipelineDebug?: unknown;
}): boolean {
  return Boolean(result.costDebug || result.pipelineDebug);
}

/** Show developer inspector when debug flags are on or server attached debug data. */
export function shouldShowWorkflowInspector(result: {
  costDebug?: unknown;
  pipelineDebug?: unknown;
} | null): boolean {
  if (!result) return false;
  if (isAtlasClientDebugEnabled()) return true;
  return orchestrationHasInspectorPayload(result);
}
