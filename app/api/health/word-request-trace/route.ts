import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { runWordRequestTrace } from "@/lib/deliverables/word-request-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let lastRunAtMs = 0;
let lastOk = false;
const MIN_INTERVAL_MS = 60_000;

/**
 * Word request trace.
 * Auth required. Public-safe status only.
 */
export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const now = Date.now();
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && lastRunAtMs > 0 && now - lastRunAtMs < MIN_INTERVAL_MS) {
    const body = toPublicHealthResponse({ ok: lastOk }, { cached: true });
    return Response.json(body, {
      status: lastOk ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const origin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return "https://atlasapp.jp";
    }
  })();

  const result = await runWordRequestTrace({ requestOrigin: origin });
  lastRunAtMs = Date.now();
  lastOk = Boolean(result && (result as { ok?: boolean }).ok !== false);
  // Some traces use pass/fail differently — prefer explicit ok when present.
  if (result && typeof result === "object" && "ok" in result) {
    lastOk = Boolean((result as { ok: boolean }).ok);
  }

  if (!lastOk) {
    console.error("[health/word-request-trace] failed", { ok: false });
  }

  const body = toPublicHealthResponse({ ok: lastOk }, { cached: false });
  return Response.json(body, {
    status: lastOk ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
