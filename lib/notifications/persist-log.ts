import { getAutomationTickContext, safeUserRef } from "@/lib/automations/tick-context";
import { safeLog } from "@/lib/security/redact";

export type NotificationPersistenceTarget =
  | "atlas_user_notifications"
  | "atlas_user_state"
  | "memory_durable"
  | "none";

export function classifyNotificationPersistError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (/schema cache|PGRST205|Could not find the table/i.test(msg)) {
    return "schema_cache_missing";
  }
  if (/42501|permission denied|RLS/i.test(msg)) return "permission_denied";
  if (/23505|duplicate/i.test(msg)) return "duplicate_key";
  if (/timeout|ETIMEDOUT|abort/i.test(msg)) return "timeout";
  if (/service.?role|not configured/i.test(msg)) return "service_role_missing";
  if (/unavailable|persist_failed|skipped/i.test(msg)) return "persist_failed";
  return "persist_failed";
}

export function logAutomationNotificationPersistence(input: {
  success: boolean;
  durationMs: number;
  persistenceTarget: NotificationPersistenceTarget;
  notificationId?: string | null;
  userId?: string | null;
  errorCode?: string | null;
  stage: string;
  jobId?: string | null;
}): void {
  const ctx = getAutomationTickContext();
  safeLog("info", "AUTOMATION_NOTIFICATION_PERSISTENCE", {
    tickId: ctx?.tickId ?? null,
    jobId: input.jobId ?? ctx?.jobId ?? null,
    notificationId: input.notificationId ?? null,
    userRef: safeUserRef(input.userId),
    success: input.success,
    durationMs: input.durationMs,
    errorCode: input.errorCode ?? null,
    persistenceTarget: input.persistenceTarget,
    stage: input.stage,
  });
}
