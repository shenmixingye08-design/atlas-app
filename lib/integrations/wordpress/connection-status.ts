import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";

import { ensureExternalAuthHydrated } from "../external-services/durable";
import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "../external-services/store";
import { WordPressApiError, fetchWordPressCurrentUser } from "./api-client";
import {
  getWordPressAuthContext,
  markWordPressAuthFailure,
  touchWordPressConnectionLastUsed,
} from "./connection-service";
import {
  WP_AUTH_FAILURE_MESSAGE,
  WP_CONNECTION_ERROR_MESSAGE,
  WP_NOT_CONNECTED_MESSAGE,
  WP_RECONNECT_REQUIRED_MESSAGE,
} from "./errors";
import type { WordPressConnectionCheckResult } from "./types";

/**
 * Verify WordPress connection without exposing Application Password.
 */
export async function checkWordPressConnectionForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<WordPressConnectionCheckResult> {
  if (!isFeatureEnabled("wordpress", input.context)) {
    return {
      status: "feature_disabled",
      connected: false,
      message: featureDisabledMessage("wordpress"),
    };
  }

  await ensureExternalAuthHydrated(input.userId);
  const connection = getExternalServiceConnection(input.userId, "wordpress");

  if (connection.status === "disconnected" || connection.status === "pending") {
    return {
      status: "disconnected",
      connected: false,
      message: WP_NOT_CONNECTED_MESSAGE,
    };
  }

  const auth = getWordPressAuthContext(input.userId);
  if (!auth) {
    return {
      status: "reconnect_required",
      connected: false,
      message: WP_RECONNECT_REQUIRED_MESSAGE,
      errorMessage: connection.errorMessage,
    };
  }

  if (connection.status === "error") {
    const isAuth =
      connection.errorMessage?.includes("認証") ||
      connection.errorMessage === WP_AUTH_FAILURE_MESSAGE;
    return {
      status: isAuth ? "auth_failure" : "reconnect_required",
      connected: false,
      message: connection.errorMessage ?? WP_RECONNECT_REQUIRED_MESSAGE,
      errorMessage: connection.errorMessage,
      site: {
        siteUrl: auth.siteUrl,
        siteName: connection.account?.name ?? null,
        username: auth.username,
      },
      connectedAt: connection.connectedAt,
      lastUsedAt: connection.lastUsedAt,
    };
  }

  try {
    const me = await fetchWordPressCurrentUser(auth);

    if (
      connection.account?.username !== auth.username ||
      connection.account?.name !== me.name
    ) {
      saveExternalServiceConnection(input.userId, {
        ...connection,
        account: {
          email: auth.siteUrl,
          name: me.name || auth.username,
          pictureUrl: null,
          username: auth.username,
        },
      });
    }

    await touchWordPressConnectionLastUsed(input.userId);

    return {
      status: "ready",
      connected: true,
      message: "WordPress接続は有効です",
      site: {
        siteUrl: auth.siteUrl,
        siteName: me.name || connection.account?.name || null,
        username: auth.username,
      },
      connectedAt: connection.connectedAt,
      lastUsedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof WordPressApiError && error.isAuthFailure) {
      await markWordPressAuthFailure(input.userId);
      return {
        status: "auth_failure",
        connected: false,
        message: WP_AUTH_FAILURE_MESSAGE,
        errorMessage: WP_AUTH_FAILURE_MESSAGE,
        site: {
          siteUrl: auth.siteUrl,
          siteName: connection.account?.name ?? null,
          username: auth.username,
        },
        connectedAt: connection.connectedAt,
        lastUsedAt: connection.lastUsedAt,
      };
    }

    const message =
      error instanceof Error ? error.message : WP_CONNECTION_ERROR_MESSAGE;
    console.warn("[WordPress Connection] Verify failed:", message);
    return {
      status: "error",
      connected: false,
      message: "WordPress接続の確認に失敗しました。再接続をお試しください",
      errorMessage: message,
    };
  }
}
