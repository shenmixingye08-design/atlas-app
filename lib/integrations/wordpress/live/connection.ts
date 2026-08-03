/**
 * WordPress connection health for Production Live Adapter.
 */

import "server-only";

import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import {
  getWordPressAuthContext,
  markWordPressAuthFailure,
} from "@/lib/integrations/wordpress/connection-service";
import {
  isWordPressEncryptionConfigured,
} from "@/lib/integrations/wordpress/config";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import type { WordPressConnectionHealth } from "./types";

export type WordPressConnectionValidation = {
  health: WordPressConnectionHealth;
  ready: boolean;
  siteUrl: string | null;
  message: string | null;
};

export async function validateWordPressConnection(
  ownerId: string,
): Promise<WordPressConnectionValidation> {
  await ensureExternalAuthHydrated(ownerId);

  if (isAtlasProduction() && !isWordPressEncryptionConfigured()) {
    return {
      health: "invalid",
      ready: false,
      siteUrl: null,
      message:
        "WordPress認証情報の暗号化キーが未設定のため有効化できません",
    };
  }

  const connection = getExternalServiceConnection(ownerId, "wordpress");
  const auth = getWordPressAuthContext(ownerId);

  if (!auth || connection.status === "disconnected") {
    return {
      health: "disconnected",
      ready: false,
      siteUrl: null,
      message: "WordPress連携が未接続です",
    };
  }

  if (connection.status === "error") {
    const msg = connection.errorMessage ?? "";
    if (/auth|認証|401|403/i.test(msg)) {
      return {
        health: "auth_failure",
        ready: false,
        siteUrl: auth.siteUrl,
        message: connection.errorMessage ?? "WordPress認証に失敗しました",
      };
    }
    return {
      health: "reconnect_required",
      ready: false,
      siteUrl: auth.siteUrl,
      message:
        connection.errorMessage ?? "WordPress連携の再接続が必要です",
    };
  }

  if (connection.status !== "connected") {
    return {
      health: "reconnect_required",
      ready: false,
      siteUrl: auth.siteUrl,
      message: "WordPress連携が完了していません",
    };
  }

  return {
    health: "connected",
    ready: true,
    siteUrl: auth.siteUrl,
    message: null,
  };
}

export async function markWordPressConnectionAuthFailure(
  ownerId: string,
  message?: string,
): Promise<void> {
  await markWordPressAuthFailure(ownerId, message);
}
