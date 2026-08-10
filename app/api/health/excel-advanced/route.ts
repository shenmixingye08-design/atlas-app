import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeExcelAdvanced } from "@/lib/deliverables/excel-advanced/excel-advanced-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P3-03: Advanced Excel (pivot + embedded chart) probe.
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

  const result = await probeExcelAdvanced();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    pivotSheetOk: result.pivotSheetOk,
    chartPartOk: result.chartPartOk,
    drawingPartOk: result.drawingPartOk,
    optOutOk: result.optOutOk,
    retrySafe: result.retrySafe,
    idempotent: result.idempotent,
    multiInstanceSafe: result.multiInstanceSafe,
    memoryNotSot: result.memoryNotSot,
    failClosed: result.failClosed,
    ownershipIsolationNAorOk: result.ownershipIsolationNAorOk,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/excel-advanced]", {
    ok: result.ok,
    pivotSheetOk: result.pivotSheetOk,
    chartPartOk: result.chartPartOk,
    drawingPartOk: result.drawingPartOk,
    optOutOk: result.optOutOk,
    failClosed: result.failClosed,
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
