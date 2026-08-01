/**
 * Privacy-safe product funnel events for Phase5 metrics.
 * No PII, no prompt text, no file contents.
 */

export type FunnelEventName =
  | "home_view"
  | "sample_select"
  | "request_start"
  | "request_submit"
  | "job_progress_view"
  | "artifact_ready"
  | "artifact_preview"
  | "artifact_download"
  | "artifact_revise"
  | "reuse_from_history"
  | "automation_create"
  | "external_connect_start"
  | "billing_upgrade_view"
  | "first_success"
  | "error_shown";

export type FunnelEvent = {
  name: FunnelEventName;
  at: string;
  /** Opaque session bucket — not Clerk user id in client logs. */
  sessionKey: string | null;
  requestId?: string | null;
  jobId?: string | null;
  artifactId?: string | null;
  meta?: Record<string, string | number | boolean | null>;
};

type Bucket = FunnelEvent[];

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasProductFunnel?: Bucket;
  };
  if (!scope.__atlasProductFunnel) scope.__atlasProductFunnel = [];
  return scope.__atlasProductFunnel;
}

export function trackFunnelEvent(
  name: FunnelEventName,
  input?: {
    sessionKey?: string | null;
    requestId?: string | null;
    jobId?: string | null;
    artifactId?: string | null;
    meta?: FunnelEvent["meta"];
  }
): FunnelEvent {
  const event: FunnelEvent = {
    name,
    at: new Date().toISOString(),
    sessionKey: input?.sessionKey ?? null,
    requestId: input?.requestId ?? null,
    jobId: input?.jobId ?? null,
    artifactId: input?.artifactId ?? null,
    meta: input?.meta,
  };
  const bucket = getBucket();
  bucket.unshift(event);
  if (bucket.length > 2000) bucket.length = 2000;
  return event;
}

export function listFunnelEvents(limit = 200): FunnelEvent[] {
  return getBucket().slice(0, limit);
}

export function resetFunnelEventsForTests(): void {
  getBucket().length = 0;
}

export function summarizeFunnel(events = listFunnelEvents(2000)): {
  homeViews: number;
  requestStarts: number;
  requestSubmits: number;
  artifactReady: number;
  downloads: number;
  revises: number;
  firstSuccess: number;
  errors: number;
} {
  const count = (n: FunnelEventName) =>
    events.filter((e) => e.name === n).length;
  return {
    homeViews: count("home_view"),
    requestStarts: count("request_start"),
    requestSubmits: count("request_submit"),
    artifactReady: count("artifact_ready"),
    downloads: count("artifact_download"),
    revises: count("artifact_revise"),
    firstSuccess: count("first_success"),
    errors: count("error_shown"),
  };
}
