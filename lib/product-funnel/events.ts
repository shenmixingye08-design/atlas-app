/**
 * Privacy-safe product / beta funnel events (Phase5 + Phase6).
 * No PII, no prompt text, no file contents.
 */

export type FunnelEventName =
  // Phase6 canonical
  | "signup_started"
  | "signup_completed"
  | "home_viewed"
  | "first_request_started"
  | "first_request_submitted"
  | "attachment_added"
  | "job_started"
  | "job_completed"
  | "job_failed"
  | "needs_input_shown"
  | "clarification_answered"
  | "artifact_created"
  | "artifact_previewed"
  | "artifact_downloaded"
  | "artifact_revised"
  | "conversion_started"
  | "conversion_completed"
  | "notification_opened"
  | "external_action_started"
  | "external_action_completed"
  | "automation_created"
  | "feedback_submitted"
  | "session_abandoned"
  // Phase5 aliases (accepted + normalized)
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

export const FUNNEL_EVENT_ALIASES: Partial<
  Record<FunnelEventName, FunnelEventName>
> = {
  home_view: "home_viewed",
  request_start: "first_request_started",
  request_submit: "first_request_submitted",
  artifact_ready: "artifact_created",
  artifact_preview: "artifact_previewed",
  artifact_download: "artifact_downloaded",
  artifact_revise: "artifact_revised",
  automation_create: "automation_created",
  external_connect_start: "external_action_started",
};

export type FunnelEvent = {
  name: FunnelEventName;
  at: string;
  anonymousUserId: string | null;
  sessionId: string | null;
  requestId: string | null;
  jobId: string | null;
  artifactId: string | null;
  deviceType: string | null;
  viewport: string | null;
  previousScreen: string | null;
  currentScreen: string | null;
  errorCode: string | null;
  durationMs: number | null;
  isBeta: boolean;
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

function normalizeName(name: FunnelEventName): FunnelEventName {
  return FUNNEL_EVENT_ALIASES[name] ?? name;
}

export function trackFunnelEvent(
  name: FunnelEventName,
  input?: {
    sessionKey?: string | null;
    sessionId?: string | null;
    anonymousUserId?: string | null;
    requestId?: string | null;
    jobId?: string | null;
    artifactId?: string | null;
    deviceType?: string | null;
    viewport?: string | null;
    previousScreen?: string | null;
    currentScreen?: string | null;
    errorCode?: string | null;
    durationMs?: number | null;
    isBeta?: boolean;
    meta?: FunnelEvent["meta"];
  }
): FunnelEvent {
  const event: FunnelEvent = {
    name: normalizeName(name),
    at: new Date().toISOString(),
    anonymousUserId: input?.anonymousUserId ?? null,
    sessionId: input?.sessionId ?? input?.sessionKey ?? null,
    requestId: input?.requestId ?? null,
    jobId: input?.jobId ?? null,
    artifactId: input?.artifactId ?? null,
    deviceType: input?.deviceType ?? null,
    viewport: input?.viewport ?? null,
    previousScreen: input?.previousScreen ?? null,
    currentScreen: input?.currentScreen ?? null,
    errorCode: input?.errorCode ?? null,
    durationMs:
      typeof input?.durationMs === "number" ? input.durationMs : null,
    isBeta: Boolean(input?.isBeta ?? input?.meta?.beta),
    meta: input?.meta,
  };
  const bucket = getBucket();
  bucket.unshift(event);
  if (bucket.length > 5000) bucket.length = 5000;
  return event;
}

export function listFunnelEvents(limit = 500): FunnelEvent[] {
  return getBucket().slice(0, limit);
}

export function resetFunnelEventsForTests(): void {
  getBucket().length = 0;
}

export function summarizeFunnel(events = listFunnelEvents(5000)): {
  homeViews: number;
  requestStarts: number;
  requestSubmits: number;
  artifactReady: number;
  downloads: number;
  revises: number;
  firstSuccess: number;
  errors: number;
  jobFailed: number;
  feedback: number;
  abandoned: number;
} {
  const count = (...names: FunnelEventName[]) =>
    events.filter((e) => names.includes(e.name)).length;
  return {
    homeViews: count("home_viewed", "home_view"),
    requestStarts: count("first_request_started", "request_start"),
    requestSubmits: count("first_request_submitted", "request_submit"),
    artifactReady: count("artifact_created", "artifact_ready"),
    downloads: count("artifact_downloaded", "artifact_download"),
    revises: count("artifact_revised", "artifact_revise"),
    firstSuccess: count("first_success"),
    errors: count("error_shown", "job_failed"),
    jobFailed: count("job_failed"),
    feedback: count("feedback_submitted"),
    abandoned: count("session_abandoned"),
  };
}

export const ALL_FUNNEL_EVENT_NAMES: readonly FunnelEventName[] = [
  "signup_started",
  "signup_completed",
  "home_viewed",
  "first_request_started",
  "first_request_submitted",
  "attachment_added",
  "job_started",
  "job_completed",
  "job_failed",
  "needs_input_shown",
  "clarification_answered",
  "artifact_created",
  "artifact_previewed",
  "artifact_downloaded",
  "artifact_revised",
  "conversion_started",
  "conversion_completed",
  "notification_opened",
  "external_action_started",
  "external_action_completed",
  "automation_created",
  "feedback_submitted",
  "session_abandoned",
  "home_view",
  "sample_select",
  "request_start",
  "request_submit",
  "job_progress_view",
  "artifact_ready",
  "artifact_preview",
  "artifact_download",
  "artifact_revise",
  "reuse_from_history",
  "automation_create",
  "external_connect_start",
  "billing_upgrade_view",
  "first_success",
  "error_shown",
] as const;
