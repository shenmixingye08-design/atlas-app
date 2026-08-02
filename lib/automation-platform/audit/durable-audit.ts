import "server-only";

import {
  setAutomationAuditDurablePersist,
  type AutomationAuditEvent,
} from "@/lib/automation-platform/audit/log";
import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

export const AUTOMATION_AUDIT_DOMAIN_KEY = "atlasAutomationAuditV2";

type DurableAuditState = {
  events: AutomationAuditEvent[];
};

function compact(state: DurableAuditState): DurableAuditState {
  const sorted = [...state.events].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
  return { events: sorted.slice(0, 2000) };
}

export async function persistAutomationAuditEvent(
  userId: string,
  event: AutomationAuditEvent,
): Promise<void> {
  const loaded =
    (await loadDurableDomain<DurableAuditState>(
      userId,
      AUTOMATION_AUDIT_DOMAIN_KEY,
    )) ?? { events: [] };

  const next: DurableAuditState = {
    events: [event, ...(loaded.events ?? [])],
  };

  void persistDurableDomain(userId, AUTOMATION_AUDIT_DOMAIN_KEY, next, {
    compact,
    forceSupabase: true,
  });
}

export async function listDurableAutomationAuditEvents(
  userId: string,
): Promise<AutomationAuditEvent[]> {
  const loaded = await loadDurableDomain<DurableAuditState>(
    userId,
    AUTOMATION_AUDIT_DOMAIN_KEY,
  );
  return loaded?.events ?? [];
}

// Enable durable write path for all appendAutomationAudit callers.
setAutomationAuditDurablePersist(persistAutomationAuditEvent);
