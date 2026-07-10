import "server-only";

import {
  GOOGLE_DRIVE_SCOPES,
  GOOGLE_OAUTH_AUTHORIZE_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
} from "./config";
import { createOAuthState } from "./oauth-state";

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export type GoogleUserInfo = {
  id: string;
  email: string;
  name?: string;
  picture?: string;
};

export function buildGoogleAuthorizeUrl(requestOrigin: string): string {
  const state = createOAuthState("google_drive_integration");
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleRedirectUri(requestOrigin),
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeGoogleAuthCode(
  code: string,
  requestOrigin: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    redirect_uri: getGoogleRedirectUri(requestOrigin),
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json()) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Failed to exchange Google authorization code",
    );
  }

  if (!payload.access_token) {
    throw new Error("Google token response did not include an access token");
  }

  return payload;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json()) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Failed to refresh Google access token",
    );
  }

  return payload;
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const payload = (await response.json()) as GoogleUserInfo & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "Failed to fetch Google account profile",
    );
  }

  if (!payload.email) {
    throw new Error("Google account email was not returned");
  }

  return payload;
}

export async function revokeGoogleToken(token: string): Promise<void> {
  const response = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );

  if (!response.ok) {
    console.warn("[Google OAuth] Token revoke failed:", response.status);
  }
}
