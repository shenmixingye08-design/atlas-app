/**
 * Structured production health / persistence summaries.
 * Never log secrets, tokens, raw credentials, or claim-key plaintext.
 */

import { createHash } from "crypto";

export function hashOpaqueKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export type HealthProbeSummary = {
  route: string;
  probeId: string;
  durationMs: number;
  externalCalls: number;
  dbWrites: number;
  cleanupSuccess: boolean;
  sideEffectsRemaining: number;
  result: "ok" | "degraded" | "error";
};

export function logHealthProbeSummary(summary: HealthProbeSummary): void {
  console.info("HEALTH_PROBE_SUMMARY", {
    route: summary.route,
    probeId: summary.probeId,
    durationMs: summary.durationMs,
    externalCalls: summary.externalCalls,
    dbWrites: summary.dbWrites,
    cleanupSuccess: summary.cleanupSuccess,
    sideEffectsRemaining: summary.sideEffectsRemaining,
    result: summary.result,
  });
}

export type NotificationPersistenceSummary = {
  notificationId: string | null;
  success: boolean;
  durationMs: number;
  errorCode: string | null;
  persistenceTarget: "supabase" | "skipped" | "failed";
};

export function logNotificationPersistenceSummary(
  summary: NotificationPersistenceSummary,
): void {
  console.info("NOTIFICATION_PERSISTENCE_SUMMARY", {
    notificationId: summary.notificationId,
    success: summary.success,
    durationMs: summary.durationMs,
    errorCode: summary.errorCode,
    persistenceTarget: summary.persistenceTarget,
  });
}

export type BillingUsagePersistenceSummary = {
  claimKeyHash: string;
  meter: string;
  persisted: boolean;
  deduplicated: boolean;
  durationMs: number;
  errorCode: string | null;
};

export function logBillingUsagePersistenceSummary(
  summary: BillingUsagePersistenceSummary,
): void {
  console.info("BILLING_USAGE_PERSISTENCE_SUMMARY", {
    claimKeyHash: summary.claimKeyHash,
    meter: summary.meter,
    persisted: summary.persisted,
    deduplicated: summary.deduplicated,
    durationMs: summary.durationMs,
    errorCode: summary.errorCode,
  });
}

export type AutomationProbeSlotSummary = {
  slotCountBefore: number;
  slotCountAfter: number;
  automationCreated: number;
  automationDeleted: number;
  orphanDetected: number;
};

export function logAutomationProbeSlotSummary(
  summary: AutomationProbeSlotSummary,
): void {
  console.info("AUTOMATION_PROBE_SLOT_SUMMARY", {
    slotCountBefore: summary.slotCountBefore,
    slotCountAfter: summary.slotCountAfter,
    automationCreated: summary.automationCreated,
    automationDeleted: summary.automationDeleted,
    orphanDetected: summary.orphanDetected,
  });
}
