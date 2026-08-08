import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { probeBillingSubscriptionsSchema } from "@/lib/billing/subscriptions/schema-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Billing schema readiness probe (P0 FINAL GATE / H2).
 *
 * Read-only (default): public — boolean readiness only (no SQL / table names /
 * env fingerprints). Needed so Production billing mutex readiness is verifiable
 * without CRON_SECRET (same pattern as oauth-encryption).
 *
 * Mutating (`apply=1`): CRON_SECRET Bearer or ATLAS owner only.
 */
let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

function buildSafeBody(
  result: Awaited<ReturnType<typeof probeBillingSubscriptionsSchema>>,
) {
  const version = getHealthVersionPayload();
  return {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    subscriptionsTableOk: result.subscriptionsTableExists,
    webhookEventsTableOk: result.webhookEventsTableExists,
    webhookClaimLeaseOk: result.webhookClaimLeaseColumnsOk,
    atomicWebhookClaimReady: result.ok,
    /** Policy flag: production webhook path never uses non-atomic durable claim. */
    durableWebhookFallbackDisabled: true,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const apply = url.searchParams.get("apply") === "1";

  if (apply) {
    const gate = await authorizeHealthProbe(request);
    if (!gate.ok) return healthUnauthorizedResponse(gate);
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

  const result = await probeBillingSubscriptionsSchema({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = buildSafeBody(result);
  lastSafeBody = body;

  console.info("[health/billing-schema]", {
    ok: result.ok,
    subscriptionsTableExists: result.subscriptionsTableExists,
    webhookEventsTableExists: result.webhookEventsTableExists,
    webhookClaimLeaseColumnsOk: result.webhookClaimLeaseColumnsOk,
    appliedViaPostgres: result.appliedViaPostgres,
    appliedViaManagementApi: result.appliedViaManagementApi,
    applyRequested: apply,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
