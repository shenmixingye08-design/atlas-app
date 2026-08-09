/**
 * P1-07 Production smoke: inject → detect → incident → notify → recover.
 * Uses synthetic injections only (no user job mutation).
 */

import "server-only";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import { evaluateAllChecks } from "./checks";
import {
  activateFailureInjection,
  deactivateFailureInjection,
} from "./inject";
import { runExternalMonitorCycle } from "./runner";
import {
  getIncidentById,
  listDeliveriesForIncident,
  listOpenIncidents,
} from "./store";
import { isExternalMonitorDurableReady } from "./table-ready";
import type { InjectionKind } from "./types";

export type ExternalMonitorProductionSmoke = {
  ok: boolean;
  error: string | null;
  evidence: {
    injectionKind: InjectionKind;
    injectionId: string | null;
    incidentId: string | null;
    detectedAt: string | null;
    deliveryStatus: string | null;
    deliveryChannel: string | null;
    recoveryAt: string | null;
    recoveryDeliveryStatus: string | null;
    commitShaShort: string;
    lineConfigured: boolean;
    ownerNotifyPath: "line" | "system" | "none";
    /** Post-clear tick check status (must be ok for recovery). */
    postClearTickStatus: string | null;
    /** Incident status after recovery cycle. */
    incidentStatusAfterRecovery: string | null;
    /** Real tick HTTP used to re-establish heartbeat before recovery. */
    tickReestablishHttpStatus: number | null;
    tickReestablishOk: boolean;
    resolvedThisCycle: number | null;
  };
};

const SMOKE_KIND: InjectionKind = "tick_failure";

function productionBaseUrl(): string {
  const raw =
    process.env.ATLAS_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://atlasapp.jp";
  return raw.replace(/\/$/, "");
}

/**
 * Re-establish a real successful tick heartbeat after clearing synthetic
 * tick_failure. Without this, a long-stopped Minute Scheduler leaves
 * scheduler.tick non-ok and recovery cannot resolve the incident.
 */
async function reestablishTickHeartbeat(): Promise<{
  ok: boolean;
  httpStatus: number | null;
}> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Fall back to in-process success markers when secret absent (non-prod).
    try {
      const { recordCronTickSuccess } = await import(
        "@/lib/owner/monitoring/store"
      );
      recordCronTickSuccess(new Date().toISOString());
      const { getWorkQueueStore } = await import("@/lib/work-queue/store");
      await getWorkQueueStore().recordSchedulerSuccess(new Date().toISOString());
      return { ok: true, httpStatus: null };
    } catch {
      return { ok: false, httpStatus: null };
    }
  }

  try {
    const response = await fetch(`${productionBaseUrl()}/api/automations/tick`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    // Also stamp in-process markers for this instance immediately.
    if (response.ok) {
      const { recordCronTickSuccess } = await import(
        "@/lib/owner/monitoring/store"
      );
      recordCronTickSuccess(new Date().toISOString());
      try {
        const { getWorkQueueStore } = await import("@/lib/work-queue/store");
        await getWorkQueueStore().recordSchedulerSuccess(
          new Date().toISOString(),
        );
      } catch {
        // optional
      }
    }
    return { ok: response.ok, httpStatus: response.status };
  } catch {
    return { ok: false, httpStatus: null };
  }
}

export async function runExternalMonitorProductionSmoke(): Promise<ExternalMonitorProductionSmoke> {
  const version = getHealthVersionPayload();
  const lineConfigured = Boolean(
    process.env.ATLAS_OWNER_LINE_USER_ID?.trim() &&
      process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim(),
  );

  const evidence: ExternalMonitorProductionSmoke["evidence"] = {
    injectionKind: SMOKE_KIND,
    injectionId: null,
    incidentId: null,
    detectedAt: null,
    deliveryStatus: null,
    deliveryChannel: null,
    recoveryAt: null,
    recoveryDeliveryStatus: null,
    commitShaShort: version.commitShaShort,
    lineConfigured,
    ownerNotifyPath: "none",
    postClearTickStatus: null,
    incidentStatusAfterRecovery: null,
    tickReestablishHttpStatus: null,
    tickReestablishOk: false,
    resolvedThisCycle: null,
  };

  if (!(await isExternalMonitorDurableReady()) && isAtlasProduction()) {
    return {
      ok: false,
      error: "external_monitor_durable_required",
      evidence,
    };
  }

  // Ensure clean slate for this synthetic kind.
  await deactivateFailureInjection({ kind: SMOKE_KIND });

  const injection = await activateFailureInjection({
    kind: SMOKE_KIND,
    ttlMs: 5 * 60_000,
    createdBy: "p107_smoke",
  });
  evidence.injectionId = injection.id;

  const failCycle = await runExternalMonitorCycle({
    nowMs: Date.now(),
  });
  evidence.detectedAt = failCycle.observedAt;

  const tickSynthetic = failCycle.checks.some(
    (c) => c.checkId === "scheduler.tick" && c.synthetic && c.status !== "ok",
  );
  const open = (await listOpenIncidents()).filter(
    (i) =>
      i.checkId === "scheduler.tick" &&
      (i.details?.synthetic === true || tickSynthetic),
  );
  const incident =
    open[0] ??
    (await listOpenIncidents()).find((i) => i.checkId === "scheduler.tick");

  if (!incident) {
    await deactivateFailureInjection({ injectionId: injection.id });
    return {
      ok: false,
      error: "incident_not_created",
      evidence,
    };
  }
  evidence.incidentId = incident.id;

  const deliveries = await listDeliveriesForIncident(incident.id);
  const opened = deliveries.find((d) => d.deliveryKind === "opened");
  evidence.deliveryStatus = opened?.status ?? null;
  evidence.deliveryChannel = opened?.channel ?? null;
  if (opened?.status === "sent") {
    evidence.ownerNotifyPath =
      opened.channel === "line" ? "line" : "system";
  } else {
    const sys = deliveries.find(
      (d) => d.deliveryKind === "opened" && d.channel === "system",
    );
    if (sys?.status === "sent") evidence.ownerNotifyPath = "system";
  }

  await deactivateFailureInjection({ injectionId: injection.id });

  // Critical: synthetic clear alone is not enough when Minute Scheduler has
  // been stopped — scheduler.tick stays non-ok and resolve is skipped.
  const tickReestablish = await reestablishTickHeartbeat();
  evidence.tickReestablishOk = tickReestablish.ok;
  evidence.tickReestablishHttpStatus = tickReestablish.httpStatus;

  const postClearChecks = await evaluateAllChecks(Date.now());
  const tickAfterClear = postClearChecks.find(
    (c) => c.checkId === "scheduler.tick",
  );
  evidence.postClearTickStatus = tickAfterClear?.status ?? null;

  if (tickAfterClear && tickAfterClear.status !== "ok") {
    return {
      ok: false,
      error: "tick_still_unhealthy_after_clear",
      evidence,
    };
  }

  const recoverCycle = await runExternalMonitorCycle({
    nowMs: Date.now(),
  });
  evidence.recoveryAt = recoverCycle.observedAt;
  evidence.resolvedThisCycle = recoverCycle.resolvedThisCycle;

  const after = await getIncidentById(incident.id);
  evidence.incidentStatusAfterRecovery = after?.status ?? null;
  if (!after || after.status !== "resolved") {
    return {
      ok: false,
      error: "incident_not_resolved",
      evidence,
    };
  }

  const recoveries = await listDeliveriesForIncident(incident.id);
  const resolvedDelivery = recoveries.find((d) => d.deliveryKind === "resolved");
  evidence.recoveryDeliveryStatus = resolvedDelivery?.status ?? null;

  const notifyOk =
    evidence.deliveryStatus === "sent" &&
    (evidence.recoveryDeliveryStatus === "sent" ||
      evidence.recoveryDeliveryStatus === "skipped");

  // In Production, Owner must have a real sent delivery.
  const ok =
    notifyOk &&
    Boolean(evidence.incidentId) &&
    Boolean(evidence.detectedAt) &&
    Boolean(evidence.recoveryAt) &&
    (!isAtlasProduction() || evidence.ownerNotifyPath !== "none");

  return {
    ok,
    error: ok
      ? null
      : !notifyOk
        ? "owner_notify_not_proven"
        : "smoke_incomplete",
    evidence,
  };
}
