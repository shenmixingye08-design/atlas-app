import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeOAuthTokenEncryptionSchema } from "@/lib/integrations/oauth-crypto/schema-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P0-02 OAuth encryption deploy gate.
 * Auth: CRON_SECRET Bearer or ATLAS owner.
 * Public response never includes tokens or SQL — only ok + safe flags.
 */
let lastRunAtMs = 0;
let lastOk = false;
const MIN_INTERVAL_MS = 30_000;

export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const apply = url.searchParams.get("apply") === "1";
  const now = Date.now();

  if (!force && !apply && lastRunAtMs > 0 && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(toPublicHealthResponse({ ok: lastOk }, { cached: true }), {
      status: lastOk ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const result = await probeOAuthTokenEncryptionSchema({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;

  // Server log: presence/shape only — never token material.
  console.info("[health/oauth-encryption]", {
    ok: result.ok,
    googleTableOk: result.googleTableOk,
    xTableOk: result.xTableOk,
    dropboxTableOk: result.dropboxTableOk,
    googleEncryptionColumnOk: result.googleEncryptionColumnOk,
    xEncryptionColumnOk: result.xEncryptionColumnOk,
    dropboxEncryptionColumnOk: result.dropboxEncryptionColumnOk,
    encryptionKeyConfigured: result.encryptionKeyConfigured,
    encryptionKeyVersionConfigured: result.encryptionKeyVersionConfigured,
    encryptionKeyVersion: result.encryptionKeyVersion,
    tokenShape: result.tokenShape,
    appliedViaPostgres: result.appliedViaPostgres,
    appliedViaManagementApi: result.appliedViaManagementApi,
    error: result.error,
  });

  // Owner/cron may receive boolean flags (still no secrets / no token samples).
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    googleTableOk: result.googleTableOk,
    xTableOk: result.xTableOk,
    dropboxTableOk: result.dropboxTableOk,
    googleEncryptionColumnOk: result.googleEncryptionColumnOk,
    xEncryptionColumnOk: result.xEncryptionColumnOk,
    dropboxEncryptionColumnOk: result.dropboxEncryptionColumnOk,
    encryptionKeyConfigured: result.encryptionKeyConfigured,
    encryptionKeyVersionConfigured: result.encryptionKeyVersionConfigured,
    encryptionKeyVersion: result.encryptionKeyVersion,
    tokenShape: result.tokenShape,
    appliedViaPostgres: result.appliedViaPostgres,
    appliedViaManagementApi: result.appliedViaManagementApi,
  };

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
