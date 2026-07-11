import "server-only";

import { randomUUID } from "crypto";

import { resolveClientIp } from "@/lib/contact/service";

import {
  ensureAuditLogHydrated,
  schedulePersistAuditLog,
} from "./durable";
import { sanitizeAuditReason } from "./sanitize";
import {
  getAuditLogSettings,
  prependAuditLogEntry,
  pruneAuditLogEntries,
} from "./store";
import type { AuditLogEntry, RecordAuditLogInput } from "./types";

function retentionCutoffIso(now = new Date()): string {
  const days = getAuditLogSettings().retentionDays;
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff.toISOString();
}

export function auditRequestContext(request: Request): {
  ip: string;
  userAgent: string | null;
} {
  return {
    ip: resolveClientIp(request),
    userAgent: request.headers.get("user-agent"),
  };
}

/**
 * Append an audit entry (memory + durable schedule).
 * Never stores passwords / tokens / secrets / cookies / API keys.
 */
export async function recordAuditLog(
  input: RecordAuditLogInput,
): Promise<AuditLogEntry> {
  await ensureAuditLogHydrated();

  const entry: AuditLogEntry = {
    id: `aud_${randomUUID()}`,
    at: input.at ?? new Date().toISOString(),
    userId: input.userId ?? null,
    email: input.email ? sanitizeAuditReason(input.email) : null,
    ip: input.ip ? sanitizeAuditReason(input.ip) : null,
    userAgent: input.userAgent
      ? sanitizeAuditReason(input.userAgent)?.slice(0, 300) ?? null
      : null,
    category: input.category,
    action: sanitizeAuditReason(input.action) ?? "unknown",
    targetId: input.targetId ? sanitizeAuditReason(input.targetId) : null,
    result: input.result,
    reason: sanitizeAuditReason(input.reason),
  };

  prependAuditLogEntry(entry);
  pruneAuditLogEntries(retentionCutoffIso());
  schedulePersistAuditLog();
  return entry;
}

/** Fire-and-forget wrapper for route handlers. */
export function recordAuditLogSafe(input: RecordAuditLogInput): void {
  void recordAuditLog(input).catch((error) => {
    console.warn("[audit-log] record failed:", error);
  });
}
