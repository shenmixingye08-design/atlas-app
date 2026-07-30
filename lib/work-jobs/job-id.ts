/**
 * Resolve the work-job id from commander / vision metadata.
 * Prefer explicit jobId; accept legacy workJobId only as fallback, then normalize.
 */
export function resolveWorkJobIdFromMetadata(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const jobId =
    typeof metadata.jobId === "string" && metadata.jobId.trim()
      ? metadata.jobId.trim()
      : null;
  if (jobId) return jobId;
  const workJobId =
    typeof metadata.workJobId === "string" && metadata.workJobId.trim()
      ? metadata.workJobId.trim()
      : null;
  return workJobId;
}

/** Ensure both jobId and workJobId are set to the same value for all downstream stages. */
export function withPropagatedJobId(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
  jobId: string,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    jobId,
    workJobId: jobId,
  };
}
