/**
 * Privacy-conscious Word operation analytics.
 * Never stores full document body or raw PII.
 */

export type WordAnalyticsEventName =
  | "word_request"
  | "purpose_detected"
  | "template_selected"
  | "generate_success"
  | "generate_failure"
  | "retry"
  | "persist_success"
  | "persist_failure"
  | "preview_view"
  | "download"
  | "edit"
  | "regenerate"
  | "version_download"
  | "delete"
  | "recover"
  | "support_send";

export type WordAnalyticsEvent = {
  name: WordAnalyticsEventName;
  at: number;
  userIdHash: string;
  jobId?: string | null;
  deliverableId?: string | null;
  templateId?: string | null;
  purpose?: string | null;
  format?: string | null;
  stage?: string | null;
  success?: boolean;
  durationMs?: number | null;
  sizeBytes?: number | null;
};

function getEvents(): WordAnalyticsEvent[] {
  const scope = globalThis as typeof globalThis & {
    __atlasWordAnalytics?: WordAnalyticsEvent[];
  };
  if (!scope.__atlasWordAnalytics) scope.__atlasWordAnalytics = [];
  return scope.__atlasWordAnalytics;
}

export function resetWordAnalyticsForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasWordAnalytics?: WordAnalyticsEvent[];
  };
  scope.__atlasWordAnalytics = [];
}

function hashUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return `u_${hash.toString(16)}`;
}

export function trackWordEvent(input: {
  name: WordAnalyticsEventName;
  userId: string;
  jobId?: string | null;
  deliverableId?: string | null;
  templateId?: string | null;
  purpose?: string | null;
  format?: string | null;
  stage?: string | null;
  success?: boolean;
  durationMs?: number | null;
  sizeBytes?: number | null;
}): void {
  const events = getEvents();
  events.push({
    name: input.name,
    at: Date.now(),
    userIdHash: hashUserId(input.userId),
    jobId: input.jobId ?? null,
    deliverableId: input.deliverableId ?? null,
    templateId: input.templateId ?? null,
    purpose: input.purpose ?? null,
    format: input.format ?? null,
    stage: input.stage ?? null,
    success: input.success,
    durationMs: input.durationMs ?? null,
    sizeBytes: input.sizeBytes ?? null,
  });
  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
  while (events.length > 5000 || (events[0] && events[0].at < cutoff)) {
    events.shift();
  }
}

export function listWordAnalytics(windowMs = 1000 * 60 * 60 * 24): WordAnalyticsEvent[] {
  const cutoff = Date.now() - windowMs;
  return getEvents().filter((event) => event.at >= cutoff);
}

export function summarizeWordAnalytics(windowMs = 1000 * 60 * 60 * 24): {
  byEvent: Record<string, number>;
  byTemplate: Record<string, number>;
  byPurpose: Record<string, number>;
  affectedUsers: number;
} {
  const events = listWordAnalytics(windowMs);
  const byEvent: Record<string, number> = {};
  const byTemplate: Record<string, number> = {};
  const byPurpose: Record<string, number> = {};
  const users = new Set<string>();
  for (const event of events) {
    byEvent[event.name] = (byEvent[event.name] ?? 0) + 1;
    users.add(event.userIdHash);
    if (event.templateId) {
      byTemplate[event.templateId] = (byTemplate[event.templateId] ?? 0) + 1;
    }
    if (event.purpose) {
      byPurpose[event.purpose] = (byPurpose[event.purpose] ?? 0) + 1;
    }
  }
  return {
    byEvent,
    byTemplate,
    byPurpose,
    affectedUsers: users.size,
  };
}
