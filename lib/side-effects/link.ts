/** Optional automation/job linkage attached to provider side-effect calls. */
export type SideEffectLink = {
  automationId?: string | null;
  runId?: string | null;
  occurrenceKey?: string | null;
  stepId?: string | null;
  /** Extra stable discriminator (content hash, message id…). */
  discriminator?: string | null;
};
