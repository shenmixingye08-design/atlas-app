import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { runWordRequestTrace } from "@/lib/deliverables/word-request-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let lastRunAtMs = 0;
let lastResult: Awaited<ReturnType<typeof runWordRequestTrace>> | null = null;
const MIN_INTERVAL_MS = 60_000;

/**
 * Word request trace — 9 pipeline checkpoints.
 * P07: requires CRON_SECRET Bearer or ATLAS owner (not anonymous).
 */
export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const now = Date.now();
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && lastResult && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      { ...lastResult, cached: true },
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

  const result = await runWordRequestTrace({ requestOrigin: origin });
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
