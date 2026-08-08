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
 *
 * Read-only probe (default): public — returns only boolean/count readiness
 * flags (never tokens, never SQL, never key material). Needed because
 * GitHub Actions may lack CRON_SECRET while Production still must be verifiable.
 *
 * Mutating probe (`apply=1`): CRON_SECRET Bearer or ATLAS owner only.
 */
let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

function buildSafeBody(result: Awaited<ReturnType<typeof probeOAuthTokenEncryptionSchema>>) {
  return {
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
    encryptionSelfTestOk: result.encryptionSelfTestOk,
    canaryPersistOk: result.canaryPersistOk,
    legacyReencrypted: result.legacyReencrypted,
    tokenShape: result.tokenShape,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const apply = url.searchParams.get("apply") === "1";

  if (apply) {
    const gate = await authorizeHealthProbe(request);
    if (!gate.ok) return healthUnauthorizedResponse(gate);
  }

  const now = Date.now();
  if (!force && !apply && lastSafeBody && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      { ...lastSafeBody, ...toPublicHealthResponse({ ok: lastOk }, { cached: true }) },
      {
        status: lastOk ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const result = await probeOAuthTokenEncryptionSchema({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = buildSafeBody(result);
  lastSafeBody = body;

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
    encryptionSelfTestOk: result.encryptionSelfTestOk,
    canaryPersistOk: result.canaryPersistOk,
    legacyReencrypted: result.legacyReencrypted,
    tokenShape: result.tokenShape,
    appliedViaPostgres: result.appliedViaPostgres,
    appliedViaManagementApi: result.appliedViaManagementApi,
    applyRequested: apply,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
