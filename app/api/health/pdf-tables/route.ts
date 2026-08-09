import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probePdfTableRendering } from "@/lib/deliverables/pdf-table-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P1-01: PDF table rendering probe (public, fixed sample, no user data).
 * Proves Production draws markdown tables and fails closed on omit.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  const now = Date.now();
  if (!force && lastSafeBody && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      {
        ...lastSafeBody,
        ...toPublicHealthResponse({ ok: lastOk }, { cached: true }),
      },
      {
        status: lastOk ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const result = await probePdfTableRendering();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    tablesRendered: result.tablesRendered,
    sourceTableCount: result.sourceTableCount,
    renderedTableCount: result.renderedTableCount,
    markersFound: result.markersFound,
    pdfBytes: result.pdfBytes,
    pageCount: result.pageCount,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/pdf-tables]", {
    ok: result.ok,
    tablesRendered: result.tablesRendered,
    markersFound: result.markersFound,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
