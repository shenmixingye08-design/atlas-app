import "server-only";

import {
  buildXBasicAuthHeader,
  getXClientId,
  getXRedirectUri,
  X_OAUTH_AUTHORIZE_URL,
  X_OAUTH_REVOKE_URL,
  X_OAUTH_SCOPES,
  X_OAUTH_TOKEN_URL,
  X_USERS_ME_URL,
} from "./config";
import { createXOAuthState } from "./oauth-state";
import { generatePkceCodeChallenge, generatePkceCodeVerifier } from "./pkce";

export type XTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export type XUserProfile = {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
};

export function buildXAuthorizeUrl(
  requestOrigin: string,
  userId: string,
): string {
  const codeVerifier = generatePkceCodeVerifier();
  const codeChallenge = generatePkceCodeChallenge(codeVerifier);
  const state = createXOAuthState(userId, codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: getXClientId(),
    redirect_uri: getXRedirectUri(requestOrigin),
    scope: X_OAUTH_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${X_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeXAuthCode(
  code: string,
  codeVerifier: string,
  requestOrigin: string,
): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: getXRedirectUri(requestOrigin),
    code_verifier: codeVerifier,
  });

  const response = await fetch(X_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: buildXBasicAuthHeader(),
    },
    body,
  });

  const payload = (await response.json()) as XTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Failed to exchange X authorization code",
    );
  }

  if (!payload.access_token) {
    throw new Error("X token response did not include an access token");
  }

  return payload;
}

export async function refreshXAccessToken(
  refreshToken: string,
): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(X_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: buildXBasicAuthHeader(),
    },
    body,
  });

  const payload = (await response.json()) as XTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Failed to refresh X access token",
    );
  }

  return payload;
}

export async function fetchXUserProfile(
  accessToken: string,
): Promise<XUserProfile> {
  const response = await fetch(X_USERS_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    data?: XUserProfile;
    errors?: { detail?: string }[];
  };

  if (!response.ok) {
    throw new Error(
      payload.errors?.[0]?.detail ?? "Failed to fetch X account profile",
    );
  }

  const profile = payload.data;
  if (!profile?.id || !profile.username) {
    throw new Error("X account profile was incomplete");
  }

  return profile;
}

export async function revokeXToken(token: string): Promise<void> {
  const body = new URLSearchParams({
    token,
    token_type_hint: "access_token",
  });

  const response = await fetch(X_OAUTH_REVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: buildXBasicAuthHeader(),
    },
    body,
  });

  if (!response.ok) {
    console.warn("[X OAuth] Token revoke failed:", response.status);
  }
}
