import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { runWordPipelineSmoke } from "@/lib/deliverables/word-pipeline-smoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Word pipeline smoke (no OpenAI).
 * Auth required. Public-safe status only.
 */
let lastRunAtMs = 0;
let lastOk = false;
const MIN_INTERVAL_MS = 60_000;

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

  const result = await runWordPipelineSmoke({ requestOrigin: origin });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  if (!result.ok) {
    console.error("[health/word-pipeline] smoke failed", { ok: false });
  }

  const body = toPublicHealthResponse({ ok: result.ok }, { cached: false });
  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
