import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { runVisionProductionSmoke } from "@/lib/vision/vision-production-smoke";
import { runVisionUserUploadSmoke } from "@/lib/vision/vision-user-upload-smoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vision smoke (uses OpenAI once).
 * Auth required. HTTP body is public-safe status only (no model/request ids/errors).
 */
let lastDirectAtMs = 0;
let lastDirectOk = false;
let lastUserAtMs = 0;
let lastUserOk = false;
const MIN_INTERVAL_MS = 120_000;

export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const mode = url.searchParams.get("mode") === "user_upload" ? "user_upload" : "direct";
  const now = Date.now();

  if (mode === "user_upload") {
    if (!force && lastUserAtMs > 0 && now - lastUserAtMs < MIN_INTERVAL_MS) {
      const body = toPublicHealthResponse({ ok: lastUserOk }, { cached: true });
      return Response.json(body, {
        status: lastUserOk ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    const result = await runVisionUserUploadSmoke();
    lastUserAtMs = Date.now();
    lastUserOk = result.ok;
    if (!result.ok) {
      console.error("[health/vision] user_upload smoke failed", {
        ok: false,
        stage: result.stage,
      });
    }
    const body = toPublicHealthResponse({ ok: result.ok }, { cached: false });
    return Response.json(body, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  if (!force && lastDirectAtMs > 0 && now - lastDirectAtMs < MIN_INTERVAL_MS) {
    const body = toPublicHealthResponse({ ok: lastDirectOk }, { cached: true });
    return Response.json(body, {
      status: lastDirectOk ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const result = await runVisionProductionSmoke();
  lastDirectAtMs = Date.now();
  lastDirectOk = result.ok;
  if (!result.ok) {
    console.error("[health/vision] direct smoke failed", {
      ok: false,
      stage: result.stage,
    });
  }
  const body = toPublicHealthResponse({ ok: result.ok }, { cached: false });
  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
