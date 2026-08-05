import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeReliabilityEventsSchema } from "@/lib/reliability/schema-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reliability-events schema probe.
 * Auth required. Response: public-safe status only.
 */
let lastRunAtMs = 0;
let lastOk = false;
const MIN_INTERVAL_MS = 30_000;

export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const apply = url.searchParams.get("apply") === "1";
  const now = Date.now();

  if (!force && !apply && lastRunAtMs > 0 && now - lastRunAtMs < MIN_INTERVAL_MS) {
    const body = toPublicHealthResponse({ ok: lastOk }, { cached: true });
    return Response.json(body, {
      status: lastOk ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const result = await probeReliabilityEventsSchema({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;

  if (!result.ok) {
    console.error("[health/reliability-events] probe failed", {
      ok: result.ok,
      errorClass: result.error ? "probe_error" : null,
    });
  }

  const body = toPublicHealthResponse({ ok: result.ok }, { cached: false });
  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
