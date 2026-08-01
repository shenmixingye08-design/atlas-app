import {
  createIntegrationDiagnosticId,
  createIntegrationRequestId,
  recordIntegrationAudit,
} from "./audit";
import type {
  OAuthLifecycleEvent,
  OAuthLifecyclePhase,
  ProductionIntegrationId,
} from "./types";

const MAX_EVENTS = 2_000;

function eventStore(): OAuthLifecycleEvent[] {
  const g = globalThis as typeof globalThis & {
    __atlasIntegrationOAuthEvents?: OAuthLifecycleEvent[];
  };
  if (!g.__atlasIntegrationOAuthEvents) g.__atlasIntegrationOAuthEvents = [];
  return g.__atlasIntegrationOAuthEvents;
}

export function recordOAuthLifecycleEvent(input: {
  integration: ProductionIntegrationId | string;
  userId: string;
  phase: OAuthLifecyclePhase;
  message: string;
  requestId?: string;
}): OAuthLifecycleEvent {
  const request_id = input.requestId ?? createIntegrationRequestId();
  const diagnosticId = createIntegrationDiagnosticId({
    integration: input.integration,
    action: `oauth_${input.phase}`,
    requestId: request_id,
  });

  const event: OAuthLifecycleEvent = {
    integration: input.integration,
    userId: input.userId,
    phase: input.phase,
    request_id,
    diagnosticId,
    message: input.message,
    at: new Date().toISOString(),
  };

  const store = eventStore();
  store.push(event);
  if (store.length > MAX_EVENTS) {
    store.splice(0, store.length - MAX_EVENTS);
  }

  recordIntegrationAudit({
    request_id,
    diagnosticId,
    integration: input.integration,
    action: `oauth_${input.phase}`,
    result:
      input.phase === "cancel"
        ? "cancelled"
        : input.phase === "expired" || input.phase === "insufficient_permission"
          ? "auth_failure"
          : "success",
    retry: 0,
    durationMs: 0,
    userId: input.userId,
    message: input.message,
  });

  return event;
}

/** Clear pending connection when user cancels mid-OAuth. */
export function markOAuthCancelled(input: {
  integration: ProductionIntegrationId | string;
  userId: string;
  clearPending: () => void;
  message?: string;
}): OAuthLifecycleEvent {
  input.clearPending();
  return recordOAuthLifecycleEvent({
    integration: input.integration,
    userId: input.userId,
    phase: "cancel",
    message: input.message ?? "OAuthを途中キャンセルしました",
  });
}

export function listOAuthLifecycleEvents(filter?: {
  integration?: string;
  userId?: string;
  limit?: number;
}): readonly OAuthLifecycleEvent[] {
  const limit = filter?.limit ?? 100;
  return eventStore()
    .filter((row) => {
      if (filter?.integration && row.integration !== filter.integration) {
        return false;
      }
      if (filter?.userId && row.userId !== filter.userId) return false;
      return true;
    })
    .slice(-limit);
}

export function resetOAuthLifecycleForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasIntegrationOAuthEvents?: OAuthLifecycleEvent[];
  };
  g.__atlasIntegrationOAuthEvents = [];
}

/** Map token manager outcomes to OAuth phases for consistent audit. */
export function phaseForTokenStatus(
  status: "ready" | "refresh_failed" | "missing" | "expired",
): OAuthLifecyclePhase {
  if (status === "ready") return "refresh";
  if (status === "expired") return "expired";
  if (status === "refresh_failed") return "expired";
  return "reconnect";
}
