import "server-only";

import { getExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getGoogleAccountAccessTokenResult } from "@/lib/integrations/google/token-manager";
import {
  getMissingGoogleScopes,
  hasGoogleCapability,
  CALENDAR_REQUIRED_SCOPES,
} from "@/lib/integrations/google/scopes";
import { isGoogleCredentialsEncryptionConfigured } from "@/lib/integrations/google/config";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import type { CalendarConnectionHealth } from "./types";

export type CalendarConnectionValidation = {
  health: CalendarConnectionHealth;
  ready: boolean;
  accessToken: string | null;
  scopes: string;
  message: string | null;
  refreshed: boolean;
  accountEmail: string | null;
};

export async function validateCalendarConnection(
  ownerId: string,
): Promise<CalendarConnectionValidation> {
  await ensureExternalAuthHydrated(ownerId);

  if (isAtlasProduction() && !isGoogleCredentialsEncryptionConfigured()) {
    return {
      health: "invalid",
      ready: false,
      accessToken: null,
      scopes: "",
      message:
        "Google認証情報の暗号化キーが未設定のため Calendar を有効化できません",
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
      message: "Google Calendar連携が未接続です",
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

  if (!hasGoogleCapability(credentials.scope, "calendar")) {
    const missing = getMissingGoogleScopes(
      credentials.scope,
      CALENDAR_REQUIRED_SCOPES,
    );
    return {
      health: "missing_scope",
      ready: false,
      accessToken: null,
      scopes: credentials.scope,
      message: `Calendar権限が不足しています（不足: ${missing.join(", ")}）。再接続してください`,
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
  if (!latest || !hasGoogleCapability(latest.scope, "calendar")) {
    return {
      health: "missing_scope",
      ready: false,
      accessToken: null,
      scopes: latest?.scope ?? credentials.scope,
      message: "Calendar権限が不足しています。再接続してください",
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

export async function validateCalendarScopes(
  ownerId: string,
): Promise<{ ok: boolean; missing: string[]; message: string | null }> {
  await ensureExternalAuthHydrated(ownerId);
  const credentials = getExternalServiceCredentials(ownerId, "google");
  if (hasGoogleCapability(credentials?.scope, "calendar")) {
    return { ok: true, missing: [], message: null };
  }
  const missing = getMissingGoogleScopes(
    credentials?.scope,
    CALENDAR_REQUIRED_SCOPES,
  );
  return {
    ok: false,
    missing,
    message: "Google Calendarの必要な権限が不足しています。再接続してください",
  };
}
