import { getHealthVersionPayload } from "@/lib/health/version-info";
import { runActivationPipelineSmoke } from "@/lib/activation/activation-pipeline-smoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Activation Word path smoke (no OpenAI when contentAlreadyApproved path is used).
 * Proves: invokeRealDeliverable → DOCX → Storage → ownership → OOXML.
 * Rate-limited in-process.
 */
let lastRunAtMs = 0;
let lastResult: Awaited<ReturnType<typeof runActivationPipelineSmoke>> | null =
  null;
const MIN_INTERVAL_MS = 60_000;

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

  const origin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return "https://atlasapp.jp";
    }
  })();

  const result = await runActivationPipelineSmoke({ requestOrigin: origin });
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
