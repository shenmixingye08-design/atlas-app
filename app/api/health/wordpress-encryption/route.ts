import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { probeWordPressEncryptionConfig } from "@/lib/integrations/wordpress/encryption-health";
import { isAtlasProduction } from "@/lib/runtime/is-production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * WordPress encryption-key configuration probe.
 * Never returns key material — presence/shape only.
 */
export async function GET(): Promise<Response> {
  const probe = probeWordPressEncryptionConfig();
  const version = getHealthVersionPayload();
  const production = isAtlasProduction();
  const ok = production ? probe.configured : probe.ok;
  const body = {
    ...toPublicHealthResponse({ ok }, { cached: false }),
    requiredInProduction: probe.requiredInProduction,
    configured: probe.configured,
    encoding: probe.encoding,
    expectedByteLength: probe.expectedByteLength,
    acceptedEncodings: probe.acceptedEncodings,
    productionFailClosed: probe.productionFailClosed,
    usesDevFallback: probe.usesDevFallback,
    envName: probe.envName,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };

  console.info("[health/wordpress-encryption]", {
    ok,
    configured: probe.configured,
    encoding: probe.encoding,
    byteLength: probe.byteLength,
    productionFailClosed: probe.productionFailClosed,
  });

  return Response.json(body, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
