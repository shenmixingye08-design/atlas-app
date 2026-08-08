/**
 * P1-07 Production smoke: inject → detect → incident → notify → recover.
 * Uses synthetic injections only (no user job mutation).
 */

import "server-only";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { isAtlasProduction } from "@/lib/runtime/is-production";

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
  };
};

const SMOKE_KIND: InjectionKind = "tick_failure";

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

  const recoverCycle = await runExternalMonitorCycle({
    nowMs: Date.now() + 1000,
  });
  evidence.recoveryAt = recoverCycle.observedAt;

  const after = await getIncidentById(incident.id);
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
