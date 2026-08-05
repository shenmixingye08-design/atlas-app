import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { probeBillingSubscriptionsSchema } from "@/lib/billing/subscriptions/schema-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Billing schema probe for atlas_billing_subscriptions.
 * P07: requires CRON_SECRET Bearer or ATLAS owner (not anonymous).
 * - GET: check table + SELECT/UPSERT
 * - GET ?apply=1: attempt DDL via POSTGRES_URL / SUPABASE Management token
 */
let lastRunAtMs = 0;
let lastResult: Awaited<ReturnType<typeof probeBillingSubscriptionsSchema>> | null =
  null;
const MIN_INTERVAL_MS = 30_000;

export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const apply = url.searchParams.get("apply") === "1";
  const now = Date.now();

  if (!force && !apply && lastResult && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      { ...lastResult, cached: true },
      {
        status: lastResult.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const result = await probeBillingSubscriptionsSchema({ apply });
  lastRunAtMs = Date.now();
  lastResult = result;

  return Response.json(
    { ...result, cached: false },
    {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
