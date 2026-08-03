import "server-only";

import { getExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import {
  getGoogleAccountAccessTokenResult,
} from "@/lib/integrations/google/token-manager";
import {
  getMissingDriveScopes,
  hasGoogleCapability,
} from "@/lib/integrations/google/scopes";
import { isGoogleCredentialsEncryptionConfigured } from "@/lib/integrations/google/config";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import type { DriveConnectionHealth } from "./types";

export type DriveConnectionValidation = {
  health: DriveConnectionHealth;
  ready: boolean;
  accessToken: string | null;
  scopes: string;
  message: string | null;
  refreshed: boolean;
};

export async function validateDriveConnection(
  ownerId: string,
): Promise<DriveConnectionValidation> {
  await ensureExternalAuthHydrated(ownerId);

  if (isAtlasProduction() && !isGoogleCredentialsEncryptionConfigured()) {
    return {
      health: "invalid",
      ready: false,
      accessToken: null,
      scopes: "",
      message:
        "Google認証情報の暗号化キーが未設定のため Drive を有効化できません",
      refreshed: false,
    };
  }

  const connection = getExternalServiceConnection(ownerId, "google");
  const credentials = getExternalServiceCredentials(ownerId, "google");

  if (!credentials?.refreshToken || connection.status === "disconnected") {
    return {
      health: "disconnected",
      ready: false,
      accessToken: null,
      scopes: credentials?.scope ?? "",
      message: "Google Drive連携が未接続です",
      refreshed: false,
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
      };
    }
    return {
      health: "reconnect_required",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: connection.errorMessage ?? "Google連携の再接続が必要です",
      refreshed: false,
    };
  }

  if (!hasGoogleCapability(credentials.scope, "drive")) {
    return {
      health: "missing_scope",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: `Drive権限が不足しています（不足: ${getMissingDriveScopes(credentials.scope).join(", ")}）。再接続してください`,
      refreshed: false,
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
    };
  }

  const latest = getExternalServiceCredentials(ownerId, "google");
  if (!latest || !hasGoogleCapability(latest.scope, "drive")) {
    return {
      health: "missing_scope",
      ready: false,
      accessToken: null,
      scopes: latest?.scope ?? credentials.scope,
      message: "Drive権限が不足しています。再接続してください",
      refreshed: wasExpired,
    };
  }

  return {
    health: "connected",
    ready: true,
    accessToken: tokenResult.accessToken,
    scopes: latest.scope,
    message: null,
    refreshed: wasExpired,
  };
}

export async function validateDriveScopes(
  ownerId: string,
): Promise<{ ok: boolean; missing: string[]; message: string | null }> {
  await ensureExternalAuthHydrated(ownerId);
  const credentials = getExternalServiceCredentials(ownerId, "google");
  const missing = getMissingDriveScopes(credentials?.scope);
  if (missing.length === 0 && hasGoogleCapability(credentials?.scope, "drive")) {
    return { ok: true, missing: [], message: null };
  }
  return {
    ok: false,
    missing,
    message: "Google Driveの必要な権限が不足しています。再接続してください",
  };
}
