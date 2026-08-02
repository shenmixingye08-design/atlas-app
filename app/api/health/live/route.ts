import { correlationResponseHeaders, createCorrelationIds } from "@/lib/production/correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness — process is up. */
export async function GET(): Promise<Response> {
  const ids = createCorrelationIds();
  return Response.json(
    {
      live: true,
      status: "ok",
      checkedAt: new Date().toISOString(),
      correlationId: ids.correlationId,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        ...correlationResponseHeaders(ids),
      },
    },
  );
}
