import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probePptxDesign } from "@/lib/deliverables/pptx-templates/pptx-design-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P3-04: PPT design template + theme OOXML probe.
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

  const result = await probePptxDesign();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    templateRegistryOk: result.templateRegistryOk,
    distinctLayoutsOk: result.distinctLayoutsOk,
    themeAccentOk: result.themeAccentOk,
    automationThemeWiredOk: result.automationThemeWiredOk,
    slideCountHintOk: result.slideCountHintOk,
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

  console.info("[health/pptx-design]", {
    ok: result.ok,
    distinctLayoutsOk: result.distinctLayoutsOk,
    themeAccentOk: result.themeAccentOk,
    automationThemeWiredOk: result.automationThemeWiredOk,
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
