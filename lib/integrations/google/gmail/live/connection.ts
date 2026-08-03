/**
 * Gmail connection health + scope validation for Production Live Adapter.
 */

import "server-only";

import { getExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getGoogleAccountAccessTokenResult } from "@/lib/integrations/google/token-manager";
import {
  getMissingGmailScopesForAction,
  hasGmailScopesForAction,
  type GmailScopeAction,
} from "@/lib/integrations/google/scopes";
import { isGoogleCredentialsEncryptionConfigured } from "@/lib/integrations/google/config";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import type { GmailConnectionHealth } from "./types";

export type GmailConnectionValidation = {
  health: GmailConnectionHealth;
  ready: boolean;
  accessToken: string | null;
  scopes: string;
  message: string | null;
  refreshed: boolean;
  accountEmail: string | null;
};

export async function validateGmailConnection(
  ownerId: string,
  action: GmailScopeAction = "draft",
): Promise<GmailConnectionValidation> {
  await ensureExternalAuthHydrated(ownerId);

  if (isAtlasProduction() && !isGoogleCredentialsEncryptionConfigured()) {
    return {
      health: "invalid",
      ready: false,
      accessToken: null,
      scopes: "",
      message:
        "Google認証情報の暗号化キーが未設定のため Gmail を有効化できません",
      refreshed: false,
      accountEmail: null,
    };
  }

  const connection = getExternalServiceConnection(ownerId, "google");
  const credentials = getExternalServiceCredentials(ownerId, "google");
  const accountEmail = connection.account?.email ?? null;

  if (!credentials?.refreshToken || connection.status === "disconnected") {
    return {
      health: "disconnected",
      ready: false,
      accessToken: null,
      scopes: credentials?.scope ?? "",
      message: "Gmail連携が未接続です",
      refreshed: false,
      accountEmail,
    };
  }

  if (connection.status === "error") {
    const msg = connection.errorMessage ?? "";
    if (/revok/i.test(msg)) {
      return {
        health: "revoked",
        ready: false,
        accessToken: null,
        scopes: credentials.scope,
        message: "Google連携が失効しています。再接続してください",
        refreshed: false,
        accountEmail,
      };
    }
    return {
      health: "reconnect_required",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: connection.errorMessage ?? "Google連携の再接続が必要です",
      refreshed: false,
      accountEmail,
    };
  }

  if (!hasGmailScopesForAction(credentials.scope, action)) {
    const missing = getMissingGmailScopesForAction(credentials.scope, action);
    return {
      health: "missing_scope",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: `Gmail権限が不足しています（不足: ${missing.join(", ")}）。再接続してください`,
      refreshed: false,
      accountEmail,
    };
  }

  const expiresAtMs = new Date(credentials.expiresAt).getTime();
  const wasExpired =
    !Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs - 60_000;

  const tokenResult = await getGoogleAccountAccessTokenResult(ownerId);
  if (tokenResult.status === "missing") {
    return {
      health: "disconnected",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: "Googleトークンがありません",
      refreshed: false,
      accountEmail,
    };
  }
  if (tokenResult.status === "refresh_failed") {
    return {
      health: wasExpired ? "expired" : "reconnect_required",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: tokenResult.message,
      refreshed: false,
      accountEmail,
    };
  }

  const latest = getExternalServiceCredentials(ownerId, "google");
  if (!latest || !hasGmailScopesForAction(latest.scope, action)) {
    return {
      health: "missing_scope",
      ready: false,
      accessToken: null,
      scopes: latest?.scope ?? credentials.scope,
      message: "Gmail権限が不足しています。再接続してください",
      refreshed: wasExpired,
      accountEmail,
    };
  }

  return {
    health: "connected",
    ready: true,
    accessToken: tokenResult.accessToken,
    scopes: latest.scope,
    message: null,
    refreshed: wasExpired,
    accountEmail,
  };
}

export async function validateGmailScopes(
  ownerId: string,
  action: GmailScopeAction,
): Promise<{ ok: boolean; missing: string[]; message: string | null }> {
  await ensureExternalAuthHydrated(ownerId);
  const credentials = getExternalServiceCredentials(ownerId, "google");
  const missing = getMissingGmailScopesForAction(credentials?.scope, action);
  if (missing.length === 0 && hasGmailScopesForAction(credentials?.scope, action)) {
    return { ok: true, missing: [], message: null };
  }
  return {
    ok: false,
    missing,
    message: "Gmailの必要な権限が不足しています。再接続してください",
  };
}
