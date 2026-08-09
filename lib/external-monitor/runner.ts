/**
 * P1-07 monitor cycle: evaluate → incident lifecycle → single-winner notify.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import { evaluateAllChecks } from "./checks";
import {
  deliverOwnerAlert,
  ownerNotifySucceeded,
} from "./notify";
import {
  claimAlertDelivery,
  isExternalMonitorMemoryAllowed,
  listOpenIncidents,
  markDeliveryResult,
  markIncidentNotified,
  recordCheckRun,
  resolveIncident,
  upsertOpenIncident,
} from "./store";
import { isExternalMonitorDurableReady } from "./table-ready";
import {
  cooldownMsForSeverity,
  EXTERNAL_MONITOR_THRESHOLDS,
} from "./thresholds";
import type {
  AlertDeliveryKind,
  MonitorCheckId,
  MonitorCheckResult,
  MonitorCycleResult,
} from "./types";

function instanceId(): string {
  const scope = globalThis as typeof globalThis & {
    __atlasExternalMonitorInstanceId?: string;
  };
  if (!scope.__atlasExternalMonitorInstanceId) {
    scope.__atlasExternalMonitorInstanceId = `inst_${randomUUID().slice(0, 8)}`;
  }
  return scope.__atlasExternalMonitorInstanceId;
}

function shouldNotify(input: {
  notifyCount: number;
  lastNotifiedAt: string | null;
  severity: "warning" | "high" | "critical";
  nowMs: number;
}): { kind: AlertDeliveryKind | null } {
  if (input.notifyCount === 0) return { kind: "opened" };
  const last = input.lastNotifiedAt
    ? new Date(input.lastNotifiedAt).getTime()
    : 0;
  const elapsed = input.nowMs - last;
  const cooldown = Math.max(
    cooldownMsForSeverity(input.severity),
    EXTERNAL_MONITOR_THRESHOLDS.notify.continuationMinIntervalMs,
  );
  if (elapsed >= cooldown) return { kind: "continuation" };
  return { kind: null };
}

async function notifyOnce(input: {
  incidentId: string;
  deliveryKind: AlertDeliveryKind;
  claimedBy: string;
  nowIso: string;
}): Promise<"sent" | "skipped" | "failed"> {
  const { getIncidentById } = await import("./store");
  const incident = await getIncidentById(input.incidentId);
  if (!incident) return "failed";

  // Prefer LINE channel claim; also claim system as separate dedupe key so
  // multi-instance still single-winner per channel+kind+incident generation.
  // Include incident.id — fingerprint-only keys permanently block later
  // incidents for the same check after the first opened:g0 delivery.
  const generation =
    input.deliveryKind === "opened"
      ? "g0"
      : `g${incident.notifyCount}`;
  const dedupeKey = [
    incident.id,
    incident.fingerprint,
    input.deliveryKind,
    generation,
    "line",
  ].join(":");

  const claimed = await claimAlertDelivery({
    incidentId: incident.id,
    deliveryKind: input.deliveryKind,
    channel: "line",
    dedupeKey,
    claimedBy: input.claimedBy,
  });
  if (!claimed) return "skipped";

  const result = await deliverOwnerAlert({
    incident,
    deliveryKind: input.deliveryKind,
  });

  if (ownerNotifySucceeded(result)) {
    // Attribute the primary LINE claim accurately: only "sent" when LINE
    // actually accepted. System-only success must not be recorded as LINE.
    await markDeliveryResult({
      deliveryId: claimed.id,
      status: result.lineSent ? "sent" : "skipped",
      errorCode: result.lineSent
        ? null
        : (result.errorCode ?? "line_not_sent_system_fallback"),
    });
    await markIncidentNotified({
      incidentId: incident.id,
      at: input.nowIso,
      continuation: input.deliveryKind === "continuation",
    });
    const sysDedupe = `${incident.id}:${incident.fingerprint}:${input.deliveryKind}:${generation}:system`;
    const sysClaim = await claimAlertDelivery({
      incidentId: incident.id,
      deliveryKind: input.deliveryKind,
      channel: "system",
      dedupeKey: sysDedupe,
      claimedBy: input.claimedBy,
    });
    if (sysClaim) {
      await markDeliveryResult({
        deliveryId: sysClaim.id,
        status: result.systemSent ? "sent" : "skipped",
        errorCode: result.systemSent
          ? null
          : result.lineSent
            ? "system_optional"
            : (result.errorCode ?? "system_not_sent"),
      });
    }
    return "sent";
  }

  await markDeliveryResult({
    deliveryId: claimed.id,
    status: "failed",
    errorCode: result.errorCode ?? "owner_notify_failed",
  });
  return "failed";
}

export async function runExternalMonitorCycle(input?: {
  nowMs?: number;
  skipNotify?: boolean;
}): Promise<MonitorCycleResult> {
  const nowMs = input?.nowMs ?? Date.now();
  const observedAt = new Date(nowMs).toISOString();
  const id = instanceId();
  const durableReady = await isExternalMonitorDurableReady();
  const memoryAllowed = isExternalMonitorMemoryAllowed();

  if (!durableReady && !memoryAllowed) {
    return {
      ok: false,
      durableReady: false,
      memoryNotSot: true,
      instanceId: id,
      observedAt,
      checks: [],
      openIncidents: 0,
      resolvedThisCycle: 0,
      deliveriesAttempted: 0,
      deliveriesSent: 0,
      deliveriesSkipped: 0,
      error: isAtlasProduction()
        ? "external_monitor_durable_required"
        : "external_monitor_not_ready",
    };
  }

  const checks = await evaluateAllChecks(nowMs);
  for (const check of checks) {
    await recordCheckRun(check, id);
  }

  const failing = checks.filter((c) => c.status !== "ok");
  const failingIds = new Set(failing.map((c) => c.checkId));

  let deliveriesAttempted = 0;
  let deliveriesSent = 0;
  let deliveriesSkipped = 0;
  let resolvedThisCycle = 0;

  for (const check of failing) {
    const incident = await upsertOpenIncident({ check });
    if (input?.skipNotify) continue;
    const plan = shouldNotify({
      notifyCount: incident.notifyCount,
      lastNotifiedAt: incident.lastNotifiedAt,
      severity: incident.severity,
      nowMs,
    });
    if (!plan.kind) continue;
    deliveriesAttempted += 1;
    const outcome = await notifyOnce({
      incidentId: incident.id,
      deliveryKind: plan.kind,
      claimedBy: id,
      nowIso: observedAt,
    });
    if (outcome === "sent") deliveriesSent += 1;
    else if (outcome === "skipped") deliveriesSkipped += 1;
  }

  const open = await listOpenIncidents();
  for (const incident of open) {
    if (failingIds.has(incident.checkId as MonitorCheckId)) continue;
    const resolved = await resolveIncident(incident.id, observedAt);
    if (!resolved) continue;
    resolvedThisCycle += 1;
    if (input?.skipNotify) continue;
    deliveriesAttempted += 1;
    const outcome = await notifyOnce({
      incidentId: resolved.id,
      deliveryKind: "resolved",
      claimedBy: id,
      nowIso: observedAt,
    });
    if (outcome === "sent") deliveriesSent += 1;
    else if (outcome === "skipped") deliveriesSkipped += 1;
  }

  const openAfter = await listOpenIncidents();
  return {
    ok: true,
    durableReady: durableReady || memoryAllowed,
    memoryNotSot: true,
    instanceId: id,
    observedAt,
    checks,
    openIncidents: openAfter.length,
    resolvedThisCycle,
    deliveriesAttempted,
    deliveriesSent,
    deliveriesSkipped,
    error: null,
  };
}

export function summarizeChecks(
  checks: MonitorCheckResult[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of checks) out[c.checkId] = c.status;
  return out;
}
