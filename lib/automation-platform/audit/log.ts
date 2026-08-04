export type AutomationAuditEvent = {
  id: string;
  timestamp: string;
  actorUserId: string | null;
  action: string;
  automationId: string | null;
  runId: string | null;
  outcome: "success" | "denied" | "error";
  errorCode: string | null;
  /** Never include secrets, tokens, or full freeformNotes payloads. */
  meta: Readonly<Record<string, unknown>>;
};

type AuditBucket = AutomationAuditEvent[];

function getBucket(): AuditBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationAuditLog?: AuditBucket;
  };
  if (!globalScope.__atlasAutomationAuditLog) {
    globalScope.__atlasAutomationAuditLog = [];
  }
  return globalScope.__atlasAutomationAuditLog;
}

/** Redact freeform / secret-looking fields before audit persistence. */
export function sanitizeAuditMeta(
  meta: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const blocked = new Set([
    "freeformNotes",
    "password",
    "token",
    "accessToken",
    "refreshToken",
    "authorization",
    "secret",
    "apiKey",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (blocked.has(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function appendAutomationAudit(
  event: Omit<AutomationAuditEvent, "id" | "timestamp"> & {
    timestamp?: string;
  },
): AutomationAuditEvent {
  const record: AutomationAuditEvent = {
    id: crypto.randomUUID(),
    timestamp: event.timestamp ?? new Date().toISOString(),
    actorUserId: event.actorUserId,
    action: event.action,
    automationId: event.automationId,
    runId: event.runId,
    outcome: event.outcome,
    errorCode: event.errorCode,
    meta: sanitizeAuditMeta(event.meta),
  };
  getBucket().push(record);
  return record;
}

export function listAutomationAuditEvents(): AutomationAuditEvent[] {
  return [...getBucket()];
}

export function resetAutomationAuditLogForTests(): void {
  getBucket().length = 0;
}
