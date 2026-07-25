import "server-only";

import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { checkXConnectionForUser } from "@/lib/integrations/x/connection-status";
import { hasXWriteScope, parseXGrantedScopes } from "@/lib/integrations/x/scopes";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";

import {
  getXRecurringError,
  mapConnectionFailureToError,
  type XRecurringError,
} from "./errors";

export type XRecurringConnectionGate =
  | {
      ok: true;
      username: string | null;
      xUserId: string | null;
      scopes: string[];
      expiresAt: string | null;
      connectedAt: string | null;
    }
  | {
      ok: false;
      error: XRecurringError;
    };

/**
 * Strict gate for X recurring registration / posting.
 * "連携済み" alone is never enough — tokens, expiry, scopes, and X user id
 * must all be present and usable.
 */
export async function gateXRecurringConnection(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<XRecurringConnectionGate> {
  await ensureExternalAuthHydrated(input.userId);

  const connection = getExternalServiceConnection(input.userId, "x");
  const credentials = getExternalServiceCredentials(input.userId, "x");

  if (connection.status === "disconnected" || connection.status === "pending") {
    return { ok: false, error: getXRecurringError("x_not_connected") };
  }

  if (!credentials?.accessToken) {
    return { ok: false, error: getXRecurringError("x_missing_access_token") };
  }
  if (!credentials.refreshToken) {
    return { ok: false, error: getXRecurringError("x_missing_refresh_token") };
  }

  const expiresAtMs = Date.parse(credentials.expiresAt);
  const tokenExpired =
    Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now() - 60_000;

  const check = await checkXConnectionForUser({
    userId: input.userId,
    context: input.context,
  });

  if (check.status !== "ready" || !check.connected) {
    return {
      ok: false,
      error: mapConnectionFailureToError({
        connected: false,
        status: check.status,
        hasAccessToken: Boolean(credentials.accessToken),
        hasRefreshToken: Boolean(credentials.refreshToken),
        tokenExpired,
      }),
    };
  }

  if (check.permissionsOk === false) {
    return { ok: false, error: getXRecurringError("x_permission_missing") };
  }

  const scopes = parseXGrantedScopes(
    credentials.scope || check.scopes || connection.scopes,
  );
  if (!hasXWriteScope(scopes)) {
    return { ok: false, error: getXRecurringError("x_permission_missing") };
  }

  const xUserId =
    check.account?.providerUserId ??
    connection.account?.providerUserId ??
    null;
  if (!xUserId) {
    return { ok: false, error: getXRecurringError("x_reconnect_required") };
  }

  return {
    ok: true,
    username: check.account?.username ?? connection.account?.username ?? null,
    xUserId,
    scopes,
    expiresAt: credentials.expiresAt,
    connectedAt: connection.connectedAt,
  };
}
