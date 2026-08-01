import { getHealthVersionPayload } from "@/lib/health/version-info";
import { runVisionProductionSmoke } from "@/lib/vision/vision-production-smoke";
import { runVisionUserUploadSmoke } from "@/lib/vision/vision-user-upload-smoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vision smoke may call OpenAI — keep ≥ single-request budget. */
export const maxDuration = 120;

/**
 * Public Production vision smoke (uses OpenAI once).
 *
 * Modes:
 * - default / ?mode=direct — known-good JPEG → Files API → Responses (no storage)
 * - ?mode=user_upload — uploadUserImages (storage) → analyzeUserImage (real user path)
 *
 * Rate-limited in-process to avoid abuse / cost spikes.
 */
let lastDirectAtMs = 0;
let lastDirectResult: Awaited<ReturnType<typeof runVisionProductionSmoke>> | null =
  null;
let lastUserAtMs = 0;
let lastUserResult: Awaited<ReturnType<typeof runVisionUserUploadSmoke>> | null =
  null;
const MIN_INTERVAL_MS = 120_000;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const mode = url.searchParams.get("mode") === "user_upload" ? "user_upload" : "direct";
  const now = Date.now();

  if (mode === "user_upload") {
    if (!force && lastUserResult && now - lastUserAtMs < MIN_INTERVAL_MS) {
      return Response.json(
        {
          ...lastUserResult,
          mode: "user_upload",
          cached: true,
          version: getHealthVersionPayload(),
        },
        {
          status: lastUserResult.ok ? 200 : 503,
          headers: { "Cache-Control": "no-store, max-age=0" },
        },
      );
    }

    const result = await runVisionUserUploadSmoke();
    lastUserAtMs = Date.now();
    lastUserResult = result;

    return Response.json(
      { ...result, mode: "user_upload", cached: false },
      {
        status: result.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  if (!force && lastDirectResult && now - lastDirectAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      {
        ...lastDirectResult,
        mode: "direct",
        cached: true,
        version: getHealthVersionPayload(),
      },
      {
        status: lastDirectResult.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const result = await runVisionProductionSmoke();
  lastDirectAtMs = Date.now();
  lastDirectResult = result;

  return Response.json(
    { ...result, mode: "direct", cached: false },
    {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
