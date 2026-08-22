import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { probeXOAuthConnectConfig } from "@/lib/integrations/x/oauth-start-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * X OAuth start configuration probe.
 * Never returns client secrets, tokens, or env values — booleans only.
 */
export async function GET(): Promise<Response> {
  const probe = probeXOAuthConnectConfig();
  const version = getHealthVersionPayload();
  const ok = probe.canStartAuthorize;
  const body = {
    ...toPublicHealthResponse({ ok }, { cached: false }),
    xClientIdConfigured: probe.flags.xClientIdConfigured,
    xClientSecretConfigured: probe.flags.xClientSecretConfigured,
    xRedirectUriConfigured: probe.flags.xRedirectUriConfigured,
    expectedRedirectUri: probe.expectedRedirectUri,
    usingCanonicalProductionRedirect: probe.usingCanonicalProductionRedirect,
    canStartAuthorize: probe.canStartAuthorize,
    canCompleteOAuth: probe.canCompleteOAuth,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };

  console.info("[health/x-oauth-connect]", {
    ok,
    xClientIdConfigured: probe.flags.xClientIdConfigured,
    xClientSecretConfigured: probe.flags.xClientSecretConfigured,
    xRedirectUriConfigured: probe.flags.xRedirectUriConfigured,
    usingCanonicalProductionRedirect: probe.usingCanonicalProductionRedirect,
    canStartAuthorize: probe.canStartAuthorize,
    canCompleteOAuth: probe.canCompleteOAuth,
  });

  return Response.json(body, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
