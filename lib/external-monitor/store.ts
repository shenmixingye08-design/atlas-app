/**
 * P1-07 durable SoT for monitor checks / incidents / deliveries / injections.
 * Process memory is test-only. Production requires Postgres.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  isExternalMonitorDurableReady,
  markExternalMonitorReadyUnknown,
} from "./table-ready";
import type {
  AlertDelivery,
  AlertDeliveryChannel,
  AlertDeliveryKind,
  AlertDeliveryStatus,
  AlertIncident,
  InjectionKind,
  MonitorCheckId,
  MonitorCheckResult,
  MonitorInjection,
} from "./types";

type MemoryBucket = {
  checkRuns: MonitorCheckResult[];
  incidents: Map<string, AlertIncident>;
  deliveries: Map<string, AlertDelivery>;
  dedupeKeys: Set<string>;
  injections: Map<string, MonitorInjection>;
};

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasExternalMonitorStore?: MemoryBucket;
  };
  if (!scope.__atlasExternalMonitorStore) {
    scope.__atlasExternalMonitorStore = {
      checkRuns: [],
      incidents: new Map(),
      deliveries: new Map(),
      dedupeKeys: new Set(),
      injections: new Map(),
    };
  }
  return scope.__atlasExternalMonitorStore;
}

export function resetExternalMonitorStoreForTests(): void {
  const bucket = getMemoryBucket();
  bucket.checkRuns = [];
  bucket.incidents.clear();
  bucket.deliveries.clear();
  bucket.dedupeKeys.clear();
  bucket.injections.clear();
}

/** Serialize memory state — used to prove restart durability in tests. */
export function exportExternalMonitorMemorySnapshotForTests(): string {
  const bucket = getMemoryBucket();
  return JSON.stringify({
    checkRuns: bucket.checkRuns,
    incidents: [...bucket.incidents.values()],
    deliveries: [...bucket.deliveries.values()],
    dedupeKeys: [...bucket.dedupeKeys],
    injections: [...bucket.injections.values()],
  });
}

export function importExternalMonitorMemorySnapshotForTests(
  raw: string,
): void {
  const parsed = JSON.parse(raw) as {
    checkRuns: MonitorCheckResult[];
    incidents: AlertIncident[];
    deliveries: AlertDelivery[];
    dedupeKeys: string[];
    injections: MonitorInjection[];
  };
  const bucket = getMemoryBucket();
  bucket.checkRuns = parsed.checkRuns ?? [];
  bucket.incidents = new Map((parsed.incidents ?? []).map((i) => [i.id, i]));
  bucket.deliveries = new Map((parsed.deliveries ?? []).map((d) => [d.id, d]));
  bucket.dedupeKeys = new Set(parsed.dedupeKeys ?? []);
  bucket.injections = new Map((parsed.injections ?? []).map((i) => [i.id, i]));
}

function forceMemory(): boolean {
  return (
    process.env.ATLAS_EXTERNAL_MONITOR_FORCE_MEMORY?.trim().toLowerCase() ===
    "true"
  );
}

export function isExternalMonitorMemoryAllowed(): boolean {
  if (isAtlasProduction()) return false;
  return forceMemory() || process.env.NODE_ENV === "test";
}

async function preferPostgresBackend(): Promise<boolean> {
  if (forceMemory() && !isAtlasProduction()) return false;
  if (!(await isExternalMonitorDurableReady())) return false;
  return Boolean(createServiceRoleClientIfConfigured());
}

function fingerprintFor(checkId: MonitorCheckId): string {
  return `p107:${checkId}`;
}

function mapIncidentRow(row: Record<string, unknown>): AlertIncident {
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    checkId: String(row.check_id) as MonitorCheckId,
    severity: row.severity as AlertIncident["severity"],
    status: row.status as AlertIncident["status"],
    title: String(row.title),
    summary: String(row.summary),
    details: (row.details as Record<string, unknown>) ?? {},
    failureClass: row.failure_class as AlertIncident["failureClass"],
    affectedUsersEstimate: Number(row.affected_users_estimate ?? 0),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    lastNotifiedAt: row.last_notified_at ? String(row.last_notified_at) : null,
    notifyCount: Number(row.notify_count ?? 0),
    continuationCount: Number(row.continuation_count ?? 0),
    claimOwner: row.claim_owner ? String(row.claim_owner) : null,
    claimUntil: row.claim_until ? String(row.claim_until) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDeliveryRow(row: Record<string, unknown>): AlertDelivery {
  return {
    id: String(row.id),
    incidentId: String(row.incident_id),
    deliveryKind: row.delivery_kind as AlertDeliveryKind,
    channel: row.channel as AlertDeliveryChannel,
    status: row.status as AlertDeliveryStatus,
    dedupeKey: String(row.dedupe_key),
    claimedBy: String(row.claimed_by),
    claimedAt: String(row.claimed_at),
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
    errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
  };
}

function mapInjectionRow(row: Record<string, unknown>): MonitorInjection {
  return {
    id: String(row.id),
    injectionKind: row.injection_kind as InjectionKind,
    active: Boolean(row.active),
    expiresAt: String(row.expires_at),
    createdBy: row.created_by ? String(row.created_by) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    clearedAt: row.cleared_at ? String(row.cleared_at) : null,
    createdAt: String(row.created_at),
  };
}

export async function recordCheckRun(
  result: MonitorCheckResult,
  instanceId: string,
): Promise<void> {
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) throw new Error("supabase_service_role_not_configured");
    const { error } = await client.from("atlas_monitor_check_runs").insert({
      id: `mcr_${randomUUID()}`,
      check_id: result.checkId,
      status: result.status,
      severity: result.severity,
      observed_at: result.observedAt,
      metrics: result.metrics,
      instance_id: instanceId,
      synthetic: result.synthetic,
    });
    if (error) throw new Error(error.message);
    return;
  }
  if (!isExternalMonitorMemoryAllowed()) {
    throw new Error("external_monitor_durable_required");
  }
  const bucket = getMemoryBucket();
  bucket.checkRuns.unshift(result);
  if (bucket.checkRuns.length > 2000) bucket.checkRuns.length = 2000;
}

export async function getLatestCheckRun(
  checkId: MonitorCheckId,
): Promise<MonitorCheckResult | null> {
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return null;
    const { data, error } = await client
      .from("atlas_monitor_check_runs")
      .select("*")
      .eq("check_id", checkId)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      checkId: data.check_id as MonitorCheckId,
      status: data.status as MonitorCheckResult["status"],
      severity: data.severity as MonitorCheckResult["severity"],
      title: String((data.metrics as { title?: string } | null)?.title ?? checkId),
      summary: String(
        (data.metrics as { summary?: string } | null)?.summary ?? "",
      ),
      metrics: (data.metrics as Record<string, number | string | boolean | null>) ?? {},
      failureClass: "internal",
      affectedUsersEstimate: 0,
      synthetic: Boolean(data.synthetic),
      observedAt: String(data.observed_at),
    };
  }
  if (!isExternalMonitorMemoryAllowed()) return null;
  return (
    getMemoryBucket().checkRuns.find((r) => r.checkId === checkId) ?? null
  );
}

export async function upsertOpenIncident(input: {
  check: MonitorCheckResult;
}): Promise<AlertIncident> {
  const fingerprint = fingerprintFor(input.check.checkId);
  const now = input.check.observedAt;
  const severity =
    input.check.severity === "ok" ? "warning" : input.check.severity;

  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) throw new Error("supabase_service_role_not_configured");

    const { data: existing } = await client
      .from("atlas_alert_incidents")
      .select("*")
      .eq("fingerprint", fingerprint)
      .eq("status", "open")
      .maybeSingle();

    if (existing) {
      const { data, error } = await client
        .from("atlas_alert_incidents")
        .update({
          severity,
          title: input.check.title,
          summary: input.check.summary,
          details: {
            metrics: input.check.metrics,
            synthetic: input.check.synthetic,
          },
          failure_class: input.check.failureClass,
          affected_users_estimate: input.check.affectedUsersEstimate,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapIncidentRow(data as Record<string, unknown>);
    }

    const id = `ainc_${randomUUID()}`;
    const { data, error } = await client
      .from("atlas_alert_incidents")
      .insert({
        id,
        fingerprint,
        check_id: input.check.checkId,
        severity,
        status: "open",
        title: input.check.title,
        summary: input.check.summary,
        details: {
          metrics: input.check.metrics,
          synthetic: input.check.synthetic,
        },
        failure_class: input.check.failureClass,
        affected_users_estimate: input.check.affectedUsersEstimate,
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) {
      // Race: another instance inserted open incident — reload.
      if (/duplicate|unique/i.test(error.message)) {
        const { data: raced } = await client
          .from("atlas_alert_incidents")
          .select("*")
          .eq("fingerprint", fingerprint)
          .eq("status", "open")
          .maybeSingle();
        if (raced) return mapIncidentRow(raced as Record<string, unknown>);
      }
      throw new Error(error.message);
    }
    return mapIncidentRow(data as Record<string, unknown>);
  }

  if (!isExternalMonitorMemoryAllowed()) {
    throw new Error("external_monitor_durable_required");
  }
  const bucket = getMemoryBucket();
  for (const incident of bucket.incidents.values()) {
    if (incident.fingerprint === fingerprint && incident.status === "open") {
      const updated: AlertIncident = {
        ...incident,
        severity,
        title: input.check.title,
        summary: input.check.summary,
        details: {
          metrics: input.check.metrics,
          synthetic: input.check.synthetic,
        },
        failureClass: input.check.failureClass,
        affectedUsersEstimate: input.check.affectedUsersEstimate,
        lastSeenAt: now,
        updatedAt: now,
      };
      bucket.incidents.set(updated.id, updated);
      return updated;
    }
  }
  const created: AlertIncident = {
    id: `ainc_${randomUUID()}`,
    fingerprint,
    checkId: input.check.checkId,
    severity,
    status: "open",
    title: input.check.title,
    summary: input.check.summary,
    details: {
      metrics: input.check.metrics,
      synthetic: input.check.synthetic,
    },
    failureClass: input.check.failureClass,
    affectedUsersEstimate: input.check.affectedUsersEstimate,
    firstSeenAt: now,
    lastSeenAt: now,
    resolvedAt: null,
    lastNotifiedAt: null,
    notifyCount: 0,
    continuationCount: 0,
    claimOwner: null,
    claimUntil: null,
    createdAt: now,
    updatedAt: now,
  };
  bucket.incidents.set(created.id, created);
  return created;
}

export async function listOpenIncidents(): Promise<AlertIncident[]> {
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return [];
    const { data, error } = await client
      .from("atlas_alert_incidents")
      .select("*")
      .eq("status", "open")
      .order("last_seen_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) =>
      mapIncidentRow(row as Record<string, unknown>),
    );
  }
  if (!isExternalMonitorMemoryAllowed()) return [];
  return [...getMemoryBucket().incidents.values()].filter(
    (i) => i.status === "open",
  );
}

export async function resolveIncident(
  incidentId: string,
  at: string,
): Promise<AlertIncident | null> {
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return null;
    const { data, error } = await client
      .from("atlas_alert_incidents")
      .update({
        status: "resolved",
        resolved_at: at,
        updated_at: at,
        claim_owner: null,
        claim_until: null,
      })
      .eq("id", incidentId)
      .eq("status", "open")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapIncidentRow(data as Record<string, unknown>) : null;
  }
  if (!isExternalMonitorMemoryAllowed()) return null;
  const bucket = getMemoryBucket();
  const existing = bucket.incidents.get(incidentId);
  if (!existing || existing.status !== "open") return null;
  const resolved: AlertIncident = {
    ...existing,
    status: "resolved",
    resolvedAt: at,
    updatedAt: at,
    claimOwner: null,
    claimUntil: null,
  };
  bucket.incidents.set(incidentId, resolved);
  return resolved;
}

/**
 * Single-winner delivery claim via unique dedupe_key.
 * Multiple instances racing → exactly one winner.
 */
export async function claimAlertDelivery(input: {
  incidentId: string;
  deliveryKind: AlertDeliveryKind;
  channel: AlertDeliveryChannel;
  dedupeKey: string;
  claimedBy: string;
}): Promise<AlertDelivery | null> {
  const id = `adel_${randomUUID()}`;
  const now = new Date().toISOString();

  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) throw new Error("supabase_service_role_not_configured");

    const { data, error } = await client.rpc("atlas_claim_alert_delivery", {
      p_id: id,
      p_incident_id: input.incidentId,
      p_delivery_kind: input.deliveryKind,
      p_channel: input.channel,
      p_dedupe_key: input.dedupeKey,
      p_claimed_by: input.claimedBy,
    });

    if (error) {
      // Fallback: insert + unique conflict
      if (/does not exist|schema cache/i.test(error.message)) {
        markExternalMonitorReadyUnknown();
        const insert = await client
          .from("atlas_alert_deliveries")
          .insert({
            id,
            incident_id: input.incidentId,
            delivery_kind: input.deliveryKind,
            channel: input.channel,
            status: "claimed",
            dedupe_key: input.dedupeKey,
            claimed_by: input.claimedBy,
            claimed_at: now,
          })
          .select("*")
          .maybeSingle();
        if (insert.error) {
          if (/duplicate|unique/i.test(insert.error.message)) return null;
          throw new Error(insert.error.message);
        }
        return insert.data
          ? mapDeliveryRow(insert.data as Record<string, unknown>)
          : null;
      }
      throw new Error(error.message);
    }
    if (!data) return null;
    return mapDeliveryRow(data as Record<string, unknown>);
  }

  if (!isExternalMonitorMemoryAllowed()) {
    throw new Error("external_monitor_durable_required");
  }
  const bucket = getMemoryBucket();
  if (bucket.dedupeKeys.has(input.dedupeKey)) return null;
  bucket.dedupeKeys.add(input.dedupeKey);
  const delivery: AlertDelivery = {
    id,
    incidentId: input.incidentId,
    deliveryKind: input.deliveryKind,
    channel: input.channel,
    status: "claimed",
    dedupeKey: input.dedupeKey,
    claimedBy: input.claimedBy,
    claimedAt: now,
    deliveredAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
  };
  bucket.deliveries.set(id, delivery);
  return delivery;
}

export async function markDeliveryResult(input: {
  deliveryId: string;
  status: Extract<AlertDeliveryStatus, "sent" | "failed" | "skipped">;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    await client
      .from("atlas_alert_deliveries")
      .update({
        status: input.status,
        delivered_at: input.status === "sent" ? now : null,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage
          ? input.errorMessage.slice(0, 200)
          : null,
      })
      .eq("id", input.deliveryId);
    return;
  }
  const bucket = getMemoryBucket();
  const existing = bucket.deliveries.get(input.deliveryId);
  if (!existing) return;
  bucket.deliveries.set(input.deliveryId, {
    ...existing,
    status: input.status,
    deliveredAt: input.status === "sent" ? now : null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage
      ? input.errorMessage.slice(0, 200)
      : null,
  });
}

export async function markIncidentNotified(input: {
  incidentId: string;
  at: string;
  continuation: boolean;
}): Promise<void> {
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    const { data: existing } = await client
      .from("atlas_alert_incidents")
      .select("notify_count, continuation_count")
      .eq("id", input.incidentId)
      .maybeSingle();
    await client
      .from("atlas_alert_incidents")
      .update({
        last_notified_at: input.at,
        notify_count: Number(existing?.notify_count ?? 0) + 1,
        continuation_count:
          Number(existing?.continuation_count ?? 0) +
          (input.continuation ? 1 : 0),
        updated_at: input.at,
      })
      .eq("id", input.incidentId);
    return;
  }
  const bucket = getMemoryBucket();
  const existing = bucket.incidents.get(input.incidentId);
  if (!existing) return;
  bucket.incidents.set(input.incidentId, {
    ...existing,
    lastNotifiedAt: input.at,
    notifyCount: existing.notifyCount + 1,
    continuationCount:
      existing.continuationCount + (input.continuation ? 1 : 0),
    updatedAt: input.at,
  });
}

export async function createInjection(input: {
  kind: InjectionKind;
  ttlMs: number;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}): Promise<MonitorInjection> {
  const now = Date.now();
  const row: MonitorInjection = {
    id: `inj_${randomUUID()}`,
    injectionKind: input.kind,
    active: true,
    expiresAt: new Date(now + input.ttlMs).toISOString(),
    createdBy: input.createdBy ?? null,
    metadata: input.metadata ?? {},
    clearedAt: null,
    createdAt: new Date(now).toISOString(),
  };

  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) throw new Error("supabase_service_role_not_configured");
    const { error } = await client.from("atlas_monitor_injections").insert({
      id: row.id,
      injection_kind: row.injectionKind,
      active: true,
      expires_at: row.expiresAt,
      created_by: row.createdBy,
      metadata: row.metadata,
      created_at: row.createdAt,
    });
    if (error) throw new Error(error.message);
    return row;
  }
  if (!isExternalMonitorMemoryAllowed()) {
    throw new Error("external_monitor_durable_required");
  }
  getMemoryBucket().injections.set(row.id, row);
  return row;
}

export async function clearInjection(injectionId: string): Promise<void> {
  const now = new Date().toISOString();
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    await client
      .from("atlas_monitor_injections")
      .update({ active: false, cleared_at: now })
      .eq("id", injectionId);
    return;
  }
  const bucket = getMemoryBucket();
  const existing = bucket.injections.get(injectionId);
  if (!existing) return;
  bucket.injections.set(injectionId, {
    ...existing,
    active: false,
    clearedAt: now,
  });
}

export async function clearInjectionsByKind(kind: InjectionKind): Promise<number> {
  const now = new Date().toISOString();
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return 0;
    const { data, error } = await client
      .from("atlas_monitor_injections")
      .update({ active: false, cleared_at: now })
      .eq("injection_kind", kind)
      .eq("active", true)
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }
  const bucket = getMemoryBucket();
  let n = 0;
  for (const [id, inj] of bucket.injections) {
    if (inj.active && inj.injectionKind === kind) {
      bucket.injections.set(id, { ...inj, active: false, clearedAt: now });
      n += 1;
    }
  }
  return n;
}

export async function listActiveInjections(
  nowMs = Date.now(),
): Promise<MonitorInjection[]> {
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return [];
    const { data, error } = await client
      .from("atlas_monitor_injections")
      .select("*")
      .eq("active", true)
      .gt("expires_at", new Date(nowMs).toISOString())
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) =>
      mapInjectionRow(row as Record<string, unknown>),
    );
  }
  if (!isExternalMonitorMemoryAllowed()) return [];
  return [...getMemoryBucket().injections.values()].filter(
    (i) => i.active && new Date(i.expiresAt).getTime() > nowMs,
  );
}

export async function listDeliveriesForIncident(
  incidentId: string,
): Promise<AlertDelivery[]> {
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return [];
    const { data, error } = await client
      .from("atlas_alert_deliveries")
      .select("*")
      .eq("incident_id", incidentId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) =>
      mapDeliveryRow(row as Record<string, unknown>),
    );
  }
  return [...getMemoryBucket().deliveries.values()].filter(
    (d) => d.incidentId === incidentId,
  );
}

export async function getIncidentById(
  incidentId: string,
): Promise<AlertIncident | null> {
  if (await preferPostgresBackend()) {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return null;
    const { data } = await client
      .from("atlas_alert_incidents")
      .select("*")
      .eq("id", incidentId)
      .maybeSingle();
    return data ? mapIncidentRow(data as Record<string, unknown>) : null;
  }
  return getMemoryBucket().incidents.get(incidentId) ?? null;
}

export { fingerprintFor };
