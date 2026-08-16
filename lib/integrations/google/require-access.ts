/**
 * Shared Google Integration access gate.
 *
 * Production evidence: Calendar/Gmail/Drive checked in-memory
 * `connection.status` BEFORE `ensureExternalAuthHydrated`. On a cold
 * serverless instance the default is `disconnected`, so durable Supabase
 * credentials were never loaded and the UI/API reported 未接続.
 *
 * Clerk Google login is NOT sufficient — only Integration OAuth credentials.
 */

import "server-only";

import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { ensureFeatureFlagsHydrated } from "@/lib/feature-flags/durable";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";

import {
  getGoogleAccountAccessTokenResult,
  type GoogleAccessTokenResult,
} from "./token-manager";
import {
  GOOGLE_INSUFFICIENT_PERMISSION_MESSAGE,
  GOOGLE_NOT_CONNECTED_MESSAGE,
  GOOGLE_RECONNECT_REQUIRED_MESSAGE,
  hasGoogleCapability,
  resolveGrantedGoogleScope,
  type GoogleCapability,
} from "./scopes";

export type GoogleAccessGateFailure = {
  status:
    | "feature_disabled"
    | "plan_required"
    | "google_not_connected"
    | "needs_reconnect"
    | "insufficient_permission";
  message: string;
};

export type GoogleAccessGateOk = { accessToken: string };

export type GoogleAccessGateResult =
  | GoogleAccessGateOk
  | GoogleAccessGateFailure;

export function isGoogleAccessGateFailure(
  value: GoogleAccessGateResult,
): value is GoogleAccessGateFailure {
  return "status" in value && !("accessToken" in value);
}

/**
 * Hydrate durable Integration credentials first, then validate connected
 * status / scopes / usable access token (with refresh).
 */
export async function requireGoogleIntegrationAccess(input: {
  userId: string;
  context: FeatureAccessContext;
  capability: GoogleCapability;
}): Promise<GoogleAccessGateResult> {
  await ensureFeatureFlagsHydrated();
  if (!isFeatureEnabled("google", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("google"),
    };
  }

  const { getBillingFeatureDenial } = await import("@/lib/billing/access");
  const denial = await getBillingFeatureDenial(
    input.userId,
    "google_integration",
  );
  if (denial) {
    return { status: "plan_required", message: denial.reason };
  }

  // CRITICAL: hydrate before reading connection status (cold-start safe).
  await ensureExternalAuthHydrated(input.userId);

  const connection = getExternalServiceConnection(input.userId, "google");
  if (connection.status === "error") {
    return {
      status: "needs_reconnect",
      message: connection.errorMessage ?? GOOGLE_RECONNECT_REQUIRED_MESSAGE,
    };
  }
  if (connection.status !== "connected") {
    return {
      status: "google_not_connected",
      message: GOOGLE_NOT_CONNECTED_MESSAGE,
    };
  }

  const credentials = getExternalServiceCredentials(input.userId, "google");
  if (!credentials?.refreshToken) {
    return {
      status: "needs_reconnect",
      message: GOOGLE_RECONNECT_REQUIRED_MESSAGE,
    };
  }

  const grantedScope = resolveGrantedGoogleScope(
    credentials.scope,
    connection.scopes,
  );
  if (!hasGoogleCapability(grantedScope, input.capability)) {
    return {
      status: "insufficient_permission",
      message: GOOGLE_INSUFFICIENT_PERMISSION_MESSAGE,
    };
  }

  const tokenResult: GoogleAccessTokenResult =
    await getGoogleAccountAccessTokenResult(input.userId);
  if (tokenResult.status === "refresh_failed") {
    return {
      status: "needs_reconnect",
      message: tokenResult.message,
    };
  }
  if (tokenResult.status !== "ready") {
    return {
      status: "google_not_connected",
      message: GOOGLE_NOT_CONNECTED_MESSAGE,
    };
  }

  return { accessToken: tokenResult.accessToken };
}
