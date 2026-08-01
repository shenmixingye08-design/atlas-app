import "server-only";

/**
 * Vision pipeline phases for background jobs.
 * timeout failures use "failed" — never "needs_input".
 */
export type VisionJobPhase =
  | "queued"
  | "preprocessing"
  | "analyzing"
  | "retrying"
  | "completed"
  | "needs_input"
  | "failed";

export const VISION_JOB_PHASES: readonly VisionJobPhase[] = [
  "queued",
  "preprocessing",
  "analyzing",
  "retrying",
  "completed",
  "needs_input",
  "failed",
] as const;

export function isVisionJobPhase(value: unknown): value is VisionJobPhase {
  return (
    typeof value === "string" &&
    (VISION_JOB_PHASES as readonly string[]).includes(value)
  );
}

/** timeout must never be mapped to needs_input. */
export function visionPhaseForError(input: {
  code?: string | null;
  gateStatus?: string | null;
}): VisionJobPhase {
  if (input.code === "timeout") return "failed";
  if (input.gateStatus === "needs_input") return "needs_input";
  return "failed";
}

export type VisionAttemptHistoryEntry = {
  attempt: number;
  phase: VisionJobPhase;
  errorCode: string | null;
  errorMessage: string | null;
  openaiRequestId: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

export function appendAttemptHistory(
  existing: unknown,
  entry: VisionAttemptHistoryEntry,
): VisionAttemptHistoryEntry[] {
  const prev = Array.isArray(existing)
    ? existing.filter(
        (row): row is VisionAttemptHistoryEntry =>
          Boolean(row) && typeof row === "object" && typeof (row as { attempt?: unknown }).attempt === "number",
      )
    : [];
  return [...prev, entry];
}
