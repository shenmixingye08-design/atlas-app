/**
 * N-08: Canonical Automation representation.
 * Internal generation (v1/v2) must never surface in user-facing copy.
 */

export type AutomationGeneration = "v1" | "v2";

/** User-facing lifecycle — labels live in status.ts */
export type CanonicalLifecycleStatus =
  | "active"
  | "paused"
  | "running"
  | "scheduled"
  | "completed"
  | "failed"
  | "needs_review"
  | "draft"
  | "archived";

export type CanonicalDeleteSemantics = "soft_delete" | "archive";

export type CanonicalAutomation = {
  /** Opaque list key — may be prefixed internally; never show generation to users. */
  canonicalId: string;
  /** Internal only — adapters / probes. */
  generation: AutomationGeneration;
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  lifecycleStatus: CanonicalLifecycleStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  scheduleSummary: string;
  canEdit: boolean;
  canPause: boolean;
  canResume: boolean;
  canDelete: boolean;
  canRunNow: boolean;
  deleteSemantics: CanonicalDeleteSemantics;
  /** Deep link without generation query (`?id=` only). */
  href: string;
  memoryCompatible: boolean;
  /** Shadow / migration linkage for list dedupe. */
  linkedV1Id: string | null;
  linkedV2Id: string | null;
};

export const PRODUCT_AUTOMATION_NOUN_JA = "自動化" as const;
