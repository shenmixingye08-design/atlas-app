import "server-only";

import { getExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getDropboxAccessToken } from "@/lib/integrations/dropbox/oauth-service";
import {
  DROPBOX_FILES_CONTENT_WRITE_SCOPE,
  DROPBOX_OAUTH_SCOPES,
  isDropboxCredentialsEncryptionConfigured,
} from "@/lib/integrations/dropbox/config";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import type { DropboxConnectionHealth } from "./types";

export type DropboxConnectionValidation = {
  health: DropboxConnectionHealth;
  ready: boolean;
  accessToken: string | null;
  scopes: string;
  message: string | null;
  refreshed: boolean;
};

function hasDropboxWriteScope(scope: string | undefined | null): boolean {
  if (!scope?.trim()) return false;
  const parts = scope.split(/[\s,]+/).filter(Boolean);
  return parts.some(
    (part) =>
      part === DROPBOX_FILES_CONTENT_WRITE_SCOPE ||
      part.endsWith(`/${DROPBOX_FILES_CONTENT_WRITE_SCOPE}`),
  );
}

function getMissingDropboxWriteScopes(scope: string | undefined | null): string[] {
  if (hasDropboxWriteScope(scope)) return [];
  return [DROPBOX_FILES_CONTENT_WRITE_SCOPE];
}

export async function validateDropboxConnection(
  ownerId: string,
): Promise<DropboxConnectionValidation> {
  await ensureExternalAuthHydrated(ownerId);

  if (isAtlasProduction() && !isDropboxCredentialsEncryptionConfigured()) {
    return {
      health: "invalid",
      ready: false,
      accessToken: null,
      scopes: "",
      message:
        "Dropbox認証情報の暗号化キーが未設定のため Dropbox を有効化できません",
      refreshed: false,
    };
  }

  const connection = getExternalServiceConnection(ownerId, "dropbox");
  const credentials = getExternalServiceCredentials(ownerId, "dropbox");

  if (!credentials?.refreshToken || connection.status === "disconnected") {
    return {
      health: "disconnected",
      ready: false,
      accessToken: null,
      scopes: credentials?.scope ?? "",
      message: "Dropbox連携が未接続です",
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
        message: "Dropbox連携が失効しています。再接続してください",
        refreshed: false,
      };
    }
    return {
      health: "reconnect_required",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: connection.errorMessage ?? "Dropbox連携の再接続が必要です",
      refreshed: false,
    };
  }

  if (!hasDropboxWriteScope(credentials.scope)) {
    return {
      health: "missing_scope",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: `Dropbox権限が不足しています（不足: ${getMissingDropboxWriteScopes(credentials.scope).join(", ")}）。再接続してください`,
      refreshed: false,
    };
  }

  const expiresAtMs = new Date(credentials.expiresAt).getTime();
  const wasExpired =
    !Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs - 60_000;

  const accessToken = await getDropboxAccessToken(ownerId);
  if (!accessToken) {
    return {
      health: wasExpired ? "expired" : "reconnect_required",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: "Dropboxトークンの更新に失敗しました。再接続してください",
      refreshed: false,
    };
  }

  const latest = getExternalServiceCredentials(ownerId, "dropbox");
  if (!latest || !hasDropboxWriteScope(latest.scope)) {
    return {
      health: "missing_scope",
      ready: false,
      accessToken: null,
      scopes: latest?.scope ?? credentials.scope,
      message: "Dropbox書き込み権限が不足しています。再接続してください",
      refreshed: wasExpired,
    };
  }

  return {
    health: "connected",
    ready: true,
    accessToken,
    scopes: latest.scope,
    message: null,
    refreshed: wasExpired,
  };
}

export async function validateDropboxScopes(
  ownerId: string,
): Promise<{ ok: boolean; missing: string[]; message: string | null }> {
  await ensureExternalAuthHydrated(ownerId);
  const credentials = getExternalServiceCredentials(ownerId, "dropbox");
  const missing = getMissingDropboxWriteScopes(credentials?.scope);
  if (missing.length === 0 && hasDropboxWriteScope(credentials?.scope)) {
    return { ok: true, missing: [], message: null };
  }
  return {
    ok: false,
    missing,
    message: `Dropboxの必要な権限が不足しています（${DROPBOX_OAUTH_SCOPES.join(", ")}）。再接続してください`,
  };
}
