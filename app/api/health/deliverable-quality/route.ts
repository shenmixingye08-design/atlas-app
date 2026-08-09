import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeDeliverablePracticalQuality } from "@/lib/deliverables/deliverable-quality-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P1-08: Deliverable practical quality probe (public, fixed sample, no user data).
 * Proves Excel numFmt, PPTX real table/image, Word ImageRun embed.
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

  const result = await probeDeliverablePracticalQuality();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    excelNumFmtOk: result.excelNumFmtOk,
    excelSidecarAbsent: result.excelSidecarAbsent,
    pptxTableOk: result.pptxTableOk,
    pptxImageOk: result.pptxImageOk,
    wordImageEmbedOk: result.wordImageEmbedOk,
    memoryNotSot: result.memoryNotSot,
    failClosedOnOmission: result.failClosedOnOmission,
    ownershipIsolationNAorOk: result.ownershipIsolationNAorOk,
    restartDurableNAorOk: result.restartDurableNAorOk,
    multiInstanceSafeNAorOk: result.multiInstanceSafeNAorOk,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/deliverable-quality]", {
    ok: result.ok,
    excelNumFmtOk: result.excelNumFmtOk,
    pptxTableOk: result.pptxTableOk,
    pptxImageOk: result.pptxImageOk,
    wordImageEmbedOk: result.wordImageEmbedOk,
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
