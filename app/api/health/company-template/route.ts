import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeCompanyTemplateTenant } from "@/lib/company-templates/company-template-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P3-02: Company template tenant isolation + Postgres SoT probe.
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

  const result = await probeCompanyTemplateTenant();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    tableOk: result.tableOk,
    durableWriteOk: result.durableWriteOk,
    restartDurableOk: result.restartDurableOk,
    retrySafe: result.retrySafe,
    idempotent: result.idempotent,
    multiInstanceSafe: result.multiInstanceSafe,
    memoryNotSot: result.memoryNotSot,
    ownershipIsolationOk: result.ownershipIsolationOk,
    serverAuthorityOk: result.serverAuthorityOk,
    failClosed: result.failClosed,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/company-template]", {
    ok: result.ok,
    durableWriteOk: result.durableWriteOk,
    restartDurableOk: result.restartDurableOk,
    ownershipIsolationOk: result.ownershipIsolationOk,
    serverAuthorityOk: result.serverAuthorityOk,
    memoryNotSot: result.memoryNotSot,
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
