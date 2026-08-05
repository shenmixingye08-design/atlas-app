import { getHealthVersionPayload } from "@/lib/health/version-info";
import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { runWordPipelineSmoke } from "@/lib/deliverables/word-pipeline-smoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Word pipeline smoke (no OpenAI).
 * P07: requires CRON_SECRET Bearer or ATLAS owner (not anonymous).
 */
let lastRunAtMs = 0;
let lastResult: Awaited<ReturnType<typeof runWordPipelineSmoke>> | null = null;
const MIN_INTERVAL_MS = 60_000;

export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const now = Date.now();
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && lastResult && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      {
        ...lastResult,
        cached: true,
        version: getHealthVersionPayload(),
      },
      {
        status: lastResult.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
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
  lastResult = result;

  return Response.json(
    { ...result, cached: false },
    {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
