import {
  correlationResponseHeaders,
  createCorrelationIds,
} from "@/lib/production/correlation";
import { getProductionHealthSnapshot } from "@/lib/production/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness — dependencies allow traffic. */
export async function GET(): Promise<Response> {
  const ids = createCorrelationIds();
  const snapshot = await getProductionHealthSnapshot();
  const status = snapshot.ready ? 200 : 503;
  return Response.json(
    {
      ready: snapshot.ready,
      status: snapshot.status,
      components: snapshot.components,
      checkedAt: snapshot.checkedAt,
      correlationId: ids.correlationId,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        ...correlationResponseHeaders(ids),
      },
    },
  );
}
