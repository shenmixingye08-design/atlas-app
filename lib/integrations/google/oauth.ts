import "server-only";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

import { createOAuthState } from "../google-drive/oauth-state";

import {
  GOOGLE_ACCOUNT_SCOPES,
  GOOGLE_OAUTH_AUTHORIZE_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  getGoogleAccountRedirectUri,
  getGoogleClientId,
  getGoogleClientSecret,
} from "./config";
import {
  generateGooglePkceCodeChallenge,
  generateGooglePkceCodeVerifier,
} from "./pkce";

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

export function buildGoogleAccountAuthorizeUrl(
  requestOrigin: string,
  userId: string,
): string {
  const codeVerifier = generateGooglePkceCodeVerifier();
  const codeChallenge = generateGooglePkceCodeChallenge(codeVerifier);
  const state = createOAuthState(userId, { codeVerifier });
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleAccountRedirectUri(requestOrigin),
    response_type: "code",
    scope: GOOGLE_ACCOUNT_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeGoogleAccountAuthCode(
  code: string,
  requestOrigin: string,
  codeVerifier?: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    redirect_uri: getGoogleAccountRedirectUri(requestOrigin),
    grant_type: "authorization_code",
  });
  if (codeVerifier?.trim()) {
    body.set("code_verifier", codeVerifier.trim());
  }

  const response = await fetchWithTimeout(GOOGLE_OAUTH_TOKEN_URL, {
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

export async function refreshGoogleAccountAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetchWithTimeout(GOOGLE_OAUTH_TOKEN_URL, {
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

export async function fetchGoogleAccountUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const response = await fetchWithTimeout(GOOGLE_USERINFO_URL, {
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

export async function revokeGoogleAccountToken(token: string): Promise<void> {
  const response = await fetchWithTimeout(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );

  if (!response.ok) {
    console.warn("[Google Account OAuth] Token revoke failed:", response.status);
  }
}
