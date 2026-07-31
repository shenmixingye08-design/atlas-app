import { getHealthVersionPayload } from "@/lib/health/version-info";
import { runVisionProductionSmoke } from "@/lib/vision/vision-production-smoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Public Production vision smoke (uses OpenAI once).
 * Verifies PR #55 path: normalize → validate → file_id/data_url → Responses API
 * with a known-good JPEG on the Production alias (atlasapp.jp).
 *
 * Rate-limited in-process to avoid abuse / cost spikes.
 */
let lastRunAtMs = 0;
let lastResult: Awaited<ReturnType<typeof runVisionProductionSmoke>> | null =
  null;
const MIN_INTERVAL_MS = 120_000;

export async function GET(request: Request): Promise<Response> {
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

  const result = await runVisionProductionSmoke();
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
