import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeJwtRls } from "@/lib/supabase/jwt-rls/jwt-rls-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P3-01: JWT連携RLS Production probe (public flags only).
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

  const result = await probeJwtRls();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    jwtBridgeOk: result.jwtBridgeOk,
    rlsEnforced: result.rlsEnforced,
    tableOk: result.tableOk,
    restartDurableOk: result.restartDurableOk,
    retrySafe: result.retrySafe,
    idempotent: result.idempotent,
    multiInstanceSafe: result.multiInstanceSafe,
    memoryNotSot: result.memoryNotSot,
    ownershipIsolationOk: result.ownershipIsolationOk,
    failClosed: result.failClosed,
    anonDenied: result.anonDenied,
    forgedJwtDenied: result.forgedJwtDenied,
    projectsJwtPolicyOk: result.projectsJwtPolicyOk,
    secretSource: result.secretSource,
    ownerActionRequired: result.ownerActionRequired,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/jwt-rls]", {
    ok: result.ok,
    jwtBridgeOk: result.jwtBridgeOk,
    rlsEnforced: result.rlsEnforced,
    ownershipIsolationOk: result.ownershipIsolationOk,
    failClosed: result.failClosed,
    secretSource: result.secretSource,
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
