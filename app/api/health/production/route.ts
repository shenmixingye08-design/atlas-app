import {
  correlationResponseHeaders,
  createCorrelationIds,
} from "@/lib/production/correlation";
import { getProductionHealthSnapshot } from "@/lib/production/health";
import { recordLatency, incrementProductionCounter } from "@/lib/production/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aggregate production health: API / Storage / Supabase / Worker / Queue / Cron / OpenAI.
 */
export async function GET(): Promise<Response> {
  const started = Date.now();
  incrementProductionCounter("requests");
  const ids = createCorrelationIds();
  try {
    const snapshot = await getProductionHealthSnapshot();
    recordLatency("health.production", Date.now() - started);
    return Response.json(
      { ...snapshot, correlationId: ids.correlationId },
      {
        status: snapshot.status === "down" ? 503 : 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          ...correlationResponseHeaders(ids),
        },
      },
    );
  } catch (error) {
    incrementProductionCounter("failures");
    return Response.json(
      {
        status: "down",
        error: error instanceof Error ? error.message : "health failed",
        correlationId: ids.correlationId,
      },
      { status: 503, headers: correlationResponseHeaders(ids) },
    );
  }
}
