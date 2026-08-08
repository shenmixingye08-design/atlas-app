import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import {
  activateFailureInjection,
  deactivateFailureInjection,
  isInjectionKind,
  probeExternalMonitorSchema,
  runExternalMonitorCycle,
} from "@/lib/external-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P1-07 external monitoring probe.
 * Public: safe readiness flags.
 * apply / run / inject / clear: CRON_SECRET or Owner only.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

function buildSafeBody(
  result: Awaited<ReturnType<typeof probeExternalMonitorSchema>>,
) {
  const version = getHealthVersionPayload();
  return {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    incidentsTableOk: result.incidentsTableOk,
    deliveriesTableOk: result.deliveriesTableOk,
    checkRunsTableOk: result.checkRunsTableOk,
    injectionsTableOk: result.injectionsTableOk,
    claimRpcOk: result.claimRpcOk,
    durableReady: result.durableReady,
    memoryNotSot: result.memoryNotSot,
    tickWired: result.tickWired,
    smokeOk: result.smokeOk,
    error: result.error,
    ownerHint: result.ownerHint,
    smokeEvidence: result.smoke?.evidence
      ? {
          injectionKind: result.smoke.evidence.injectionKind,
          incidentId: result.smoke.evidence.incidentId,
          detectedAt: result.smoke.evidence.detectedAt,
          deliveryStatus: result.smoke.evidence.deliveryStatus,
          recoveryAt: result.smoke.evidence.recoveryAt,
          recoveryDeliveryStatus: result.smoke.evidence.recoveryDeliveryStatus,
          ownerNotifyPath: result.smoke.evidence.ownerNotifyPath,
          lineConfigured: result.smoke.evidence.lineConfigured,
          commitShaShort: result.smoke.evidence.commitShaShort,
        }
      : null,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const apply = url.searchParams.get("apply") === "1";
  const run = url.searchParams.get("run") === "1";
  const smokeParam = url.searchParams.get("smoke");
  // Default off — smoke sends Owner alerts. Enable with smoke=1 or force=1.
  const smoke =
    smokeParam === "1" || (force && smokeParam !== "0");
  const inject = url.searchParams.get("inject");
  const clearInject = url.searchParams.get("clearInject");

  const needsAuth = apply || run || Boolean(inject) || Boolean(clearInject);
  if (needsAuth) {
    const gate = await authorizeHealthProbe(request);
    if (!gate.ok) return healthUnauthorizedResponse(gate);
  }

  if (inject) {
    if (!isInjectionKind(inject)) {
      return Response.json(
        { ok: false, error: "invalid_injection_kind" },
        { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    const row = await activateFailureInjection({
      kind: inject,
      createdBy: "health_probe",
    });
    const cycle = await runExternalMonitorCycle();
    return Response.json(
      {
        ok: true,
        action: "inject",
        injectionId: row.id,
        kind: row.injectionKind,
        openIncidents: cycle.openIncidents,
        deliveriesSent: cycle.deliveriesSent,
        commitShaShort: getHealthVersionPayload().commitShaShort,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (clearInject != null) {
    const kind =
      clearInject && isInjectionKind(clearInject) ? clearInject : undefined;
    const cleared = await deactivateFailureInjection(
      kind ? { kind } : {},
    );
    const cycle = await runExternalMonitorCycle();
    return Response.json(
      {
        ok: true,
        action: "clearInject",
        cleared: cleared.cleared,
        resolvedThisCycle: cycle.resolvedThisCycle,
        deliveriesSent: cycle.deliveriesSent,
        commitShaShort: getHealthVersionPayload().commitShaShort,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (run) {
    const cycle = await runExternalMonitorCycle();
    return Response.json(
      {
        ok: cycle.ok,
        action: "run",
        openIncidents: cycle.openIncidents,
        resolvedThisCycle: cycle.resolvedThisCycle,
        deliveriesSent: cycle.deliveriesSent,
        deliveriesSkipped: cycle.deliveriesSkipped,
        checkStatuses: Object.fromEntries(
          cycle.checks.map((c) => [c.checkId, c.status]),
        ),
        error: cycle.error,
        commitShaShort: getHealthVersionPayload().commitShaShort,
      },
      {
        status: cycle.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const now = Date.now();
  if (!force && !apply && lastSafeBody && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      {
        ...lastSafeBody,
        ...toPublicHealthResponse({ ok: lastOk }, { cached: true }),
      },
      {
        status: lastOk ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const result = await probeExternalMonitorSchema({ apply, smoke });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const safe = buildSafeBody(result);
  lastSafeBody = safe;

  console.info("[health/external-monitor]", {
    ok: result.ok,
    durableReady: result.durableReady,
    tickWired: result.tickWired,
    smokeOk: result.smokeOk,
    applyRequested: apply,
    error: result.error,
  });

  const body = apply
    ? {
        ...safe,
        appliedViaPostgres: result.appliedViaPostgres,
        appliedViaManagementApi: result.appliedViaManagementApi,
        envPresence: {
          serviceRole: result.envPresence.serviceRole,
          postgresUrl: result.envPresence.postgresUrl,
          supabaseAccessToken: result.envPresence.supabaseAccessToken,
          projectRefPresent: Boolean(result.envPresence.projectRef),
        },
        ownerAction: result.ok
          ? null
          : result.ownerHint ??
            "Apply DDL + NOTIFY pgrst, 'reload schema'; then re-probe ?force=1",
      }
    : safe;

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
