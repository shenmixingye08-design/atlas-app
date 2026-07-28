/**
 * Structured Word pipeline logs — identify which stage stopped.
 * Never logs document body content (PII / secrets risk).
 */

export const WORD_PIPELINE_STAGES = [
  "REQUEST_ACCEPTED",
  "JOB_PERSISTED",
  "AI_ORCHESTRATION_STARTED",
  "AI_ORCHESTRATION_COMPLETED",
  "WORD_EXPORT_STARTED",
  "DOCX_GENERATED",
  "STORAGE_SAVED",
  "DB_METADATA_SAVED",
  "STATUS_COMPLETED",
  "NOTIFICATION_CREATED",
  "UNREAD_COUNT_READY",
  "FAILED",
  "TIMEOUT",
] as const;

export type WordPipelineStage = (typeof WORD_PIPELINE_STAGES)[number];

export type WordPipelineLogInput = {
  stage: WordPipelineStage;
  jobId?: string | null;
  userId?: string | null;
  deliverableId?: string | null;
  requestId?: string | null;
  ok?: boolean;
  error?: string | null;
  /** Error.stack when available — logged truncated, never to end users. */
  stack?: string | null;
  detail?: string | null;
  durationMs?: number | null;
};

export function logWordPipeline(input: WordPipelineLogInput): void {
  const payload = {
    tag: "word_pipeline",
    ts: new Date().toISOString(),
    stage: input.stage,
    ok: input.ok ?? true,
    jobId: input.jobId ?? null,
    userId: input.userId ? `${input.userId.slice(0, 8)}…` : null,
    deliverableId: input.deliverableId ?? null,
    requestId: input.requestId ?? null,
    error: input.error ? input.error.slice(0, 500) : null,
    stack: input.stack ? input.stack.slice(0, 2000) : null,
    detail: input.detail ? input.detail.slice(0, 200) : null,
    durationMs: input.durationMs ?? null,
  };
  if (input.ok === false) {
    console.error("[word_pipeline]", JSON.stringify(payload));
    return;
  }
  console.info("[word_pipeline]", JSON.stringify(payload));
}
