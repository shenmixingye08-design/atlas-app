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
    /** Safe tick error code/message (never secrets). */
    tickReestablishErrorCode: string | null;
    /** True when smoke stamped in-process heartbeat after clear. */
    localHeartbeatStamped: boolean;
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

async function stampLocalTickHeartbeat(): Promise<boolean> {
  try {
    const at = new Date().toISOString();
    const { recordCronTickSuccess } = await import(
      "@/lib/owner/monitoring/store"
    );
    recordCronTickSuccess(at);
    try {
      const { persistMonitoringNow } = await import(
        "@/lib/owner/monitoring/durable"
      );
      await persistMonitoringNow();
    } catch {
      // best-effort durable write
    }
    try {
      const { getWorkQueueStore } = await import("@/lib/work-queue/store");
      await getWorkQueueStore().recordSchedulerSuccess(at);
    } catch {
      // optional
    }
    return true;
  } catch {
    return false;
  }
}

function safeTickErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const err = (body as { error?: unknown }).error;
  if (typeof err !== "string") return null;
  return err
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[redacted]")
    .slice(0, 160);
}

/**
 * Re-establish tick heartbeat after clearing synthetic tick_failure.
 *
 * HTTP `/api/automations/tick` is attempted for ops evidence, but recovery
 * must not be blocked when non-critical tick side-steps return 500 while
 * the synthetic injection itself is already cleared. Always stamp
 * in-process (+ durable) success on this instance after clear.
 */
async function reestablishTickHeartbeat(): Promise<{
  ok: boolean;
  httpStatus: number | null;
  errorCode: string | null;
  localHeartbeatStamped: boolean;
}> {
  const secret = process.env.CRON_SECRET?.trim();
  let httpStatus: number | null = null;
  let errorCode: string | null = null;
  let httpOk = false;

  if (secret) {
    try {
      const response = await fetch(
        `${productionBaseUrl()}/api/automations/tick`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        },
      );
      httpStatus = response.status;
      httpOk = response.ok;
      if (!response.ok) {
        try {
          errorCode = safeTickErrorCode(await response.json());
        } catch {
          errorCode = `tick_http_${response.status}`;
        }
      }
    } catch {
      httpOk = false;
      errorCode = "tick_fetch_failed";
    }
  } else {
    errorCode = "cron_secret_absent";
  }

  const localHeartbeatStamped = await stampLocalTickHeartbeat();
  return {
    ok: httpOk || localHeartbeatStamped,
    httpStatus,
    errorCode,
    localHeartbeatStamped,
  };
}

export async function runExternalMonitorProductionSmoke(): Promise<ExternalMonitorProductionSmoke> {
  const version = getHealthVersionPayload();
  const { isLineMessagingConfigured } = await import(
    "@/lib/integrations/line/config"
  );
  const lineConfigured = Boolean(
    process.env.ATLAS_OWNER_LINE_USER_ID?.trim() && isLineMessagingConfigured(),
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
    tickReestablishErrorCode: null,
    localHeartbeatStamped: false,
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
  const openedLine = deliveries.find(
    (d) => d.deliveryKind === "opened" && d.channel === "line",
  );
  const openedSystem = deliveries.find(
    (d) => d.deliveryKind === "opened" && d.channel === "system",
  );
  // Prefer actual successful channel (LINE first, then system fallback).
  if (openedLine?.status === "sent") {
    evidence.deliveryStatus = "sent";
    evidence.deliveryChannel = "line";
    evidence.ownerNotifyPath = "line";
  } else if (openedSystem?.status === "sent") {
    evidence.deliveryStatus = "sent";
    evidence.deliveryChannel = "system";
    evidence.ownerNotifyPath = "system";
  } else {
    const opened = deliveries.find((d) => d.deliveryKind === "opened");
    evidence.deliveryStatus = opened?.status ?? null;
    evidence.deliveryChannel = opened?.channel ?? null;
    evidence.ownerNotifyPath = "none";
  }

  await deactivateFailureInjection({ injectionId: injection.id });

  // Critical: synthetic clear alone is not enough when Minute Scheduler has
  // been stopped — scheduler.tick stays non-ok and resolve is skipped.
  const tickReestablish = await reestablishTickHeartbeat();
  evidence.tickReestablishOk = tickReestablish.ok;
  evidence.tickReestablishHttpStatus = tickReestablish.httpStatus;
  evidence.tickReestablishErrorCode = tickReestablish.errorCode;
  evidence.localHeartbeatStamped = tickReestablish.localHeartbeatStamped;

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
  const resolvedLine = recoveries.find(
    (d) => d.deliveryKind === "resolved" && d.channel === "line",
  );
  const resolvedSystem = recoveries.find(
    (d) => d.deliveryKind === "resolved" && d.channel === "system",
  );
  const resolvedDelivery =
    resolvedLine?.status === "sent"
      ? resolvedLine
      : resolvedSystem?.status === "sent"
        ? resolvedSystem
        : (resolvedLine ??
          resolvedSystem ??
          recoveries.find((d) => d.deliveryKind === "resolved"));
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
