import "server-only";

import { X_OAUTH_SCOPES } from "./config";
import { X_RECONNECT_REQUIRED_MESSAGE } from "./errors";
import { fetchXUserProfile } from "./oauth";
import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "../external-services/store";
import { ensureExternalAuthHydrated } from "../external-services/durable";
import { getXAccountAccessTokenResult } from "./token-manager";
import { touchXConnectionLastUsed } from "./oauth-service";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import type {
  XConnectionCheckResult,
  XPermissionCheck,
} from "./connection-types";

export type { XConnectionCheckResult, XPermissionCheck } from "./connection-types";

const REQUIRED_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
] as const;

function resolveGrantedScopes(raw: string | readonly string[]): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((scope) => scope.split(/[\s,]+/)).filter(Boolean);
  }
  return String(raw)
    .split(/[\s,]+/)
    .filter(Boolean);
}

/**
 * Verify X connection status and OAuth scopes without exposing tokens.
 * Calls X users/me to confirm the access token still works.
 */
export async function checkXConnectionForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<XConnectionCheckResult> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      connected: false,
      message: featureDisabledMessage("x"),
    };
  }

  await ensureExternalAuthHydrated(input.userId);
  const connection = getExternalServiceConnection(input.userId, "x");

  if (connection.status === "disconnected" || connection.status === "pending") {
    return {
      status: "disconnected",
      connected: false,
      message: "Xを接続してください",
    };
  }

  if (connection.status === "error") {
    return {
      status: "reconnect_required",
      connected: false,
      message: connection.errorMessage ?? X_RECONNECT_REQUIRED_MESSAGE,
      errorMessage: connection.errorMessage,
    };
  }

  const tokenResult = await getXAccountAccessTokenResult(input.userId);
  if (tokenResult.status !== "ready") {
    return {
      status: "reconnect_required",
      connected: false,
      message: X_RECONNECT_REQUIRED_MESSAGE,
      errorMessage: connection.errorMessage,
    };
  }

  try {
    const profile = await fetchXUserProfile(tokenResult.accessToken);

    const scopes = resolveGrantedScopes(
      connection.scopes.length > 0 ? connection.scopes : X_OAUTH_SCOPES,
    );
    const scopeSet = new Set(scopes);
    const permissions: XPermissionCheck[] = REQUIRED_SCOPES.map((scope) => ({
      scope,
      granted: scopeSet.has(scope),
    }));
    const permissionsOk = permissions.every((item) => item.granted);

    // Keep profile metadata fresh without exposing tokens.
    if (
      connection.account?.username !== profile.username ||
      connection.account?.providerUserId !== profile.id
    ) {
      saveExternalServiceConnection(input.userId, {
        ...connection,
        account: {
          email: `@${profile.username}`,
          name: profile.name ?? null,
          pictureUrl: profile.profile_image_url ?? null,
          providerUserId: profile.id,
          username: profile.username,
        },
      });
    }

    await touchXConnectionLastUsed(input.userId);

    return {
      status: "ready",
      connected: true,
      tokenValid: true,
      account: {
        username: profile.username,
        name: profile.name ?? null,
        providerUserId: profile.id,
      },
      scopes,
      permissions,
      permissionsOk,
      connectedAt: connection.connectedAt,
      lastUsedAt: connection.lastUsedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : X_RECONNECT_REQUIRED_MESSAGE;
    console.warn("[X Connection] Permission check failed:", message);
    return {
      status: "error",
      connected: false,
      message: "X接続の確認に失敗しました。再接続をお試しください",
    };
  }
}
