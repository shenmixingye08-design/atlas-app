import "server-only";

import {
  buildDropboxBasicAuthHeader,
  DROPBOX_ACCOUNT_URL,
  DROPBOX_OAUTH_AUTHORIZE_URL,
  DROPBOX_OAUTH_SCOPES,
  DROPBOX_OAUTH_TOKEN_URL,
  getDropboxAppKey,
  getDropboxRedirectUri,
} from "./config";
import { createDropboxOAuthState } from "./oauth-state";
import {
  generateDropboxPkceCodeChallenge,
  generateDropboxPkceCodeVerifier,
} from "./pkce";

export type DropboxTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  account_id?: string;
  uid?: string;
};

export type DropboxAccountProfile = {
  account_id: string;
  email: string;
  name: {
    display_name?: string;
    given_name?: string;
    surname?: string;
  };
  profile_photo_url?: string | null;
};

export function buildDropboxAuthorizeUrl(
  requestOrigin: string,
  userId: string,
): string {
  const codeVerifier = generateDropboxPkceCodeVerifier();
  const codeChallenge = generateDropboxPkceCodeChallenge(codeVerifier);
  const state = createDropboxOAuthState(userId, codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: getDropboxAppKey(),
    redirect_uri: getDropboxRedirectUri(requestOrigin),
    token_access_type: "offline",
    scope: DROPBOX_OAUTH_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${DROPBOX_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeDropboxAuthCode(
  code: string,
  codeVerifier: string,
  requestOrigin: string,
): Promise<DropboxTokenResponse> {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: getDropboxRedirectUri(requestOrigin),
    code_verifier: codeVerifier,
  });

  const response = await fetch(DROPBOX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: buildDropboxBasicAuthHeader(),
    },
    body,
  });

  const payload = (await response.json()) as DropboxTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Failed to exchange Dropbox authorization code",
    );
  }

  if (!payload.access_token) {
    throw new Error("Dropbox token response did not include an access token");
  }

  return payload;
}

export async function refreshDropboxAccessToken(
  refreshToken: string,
): Promise<DropboxTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(DROPBOX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: buildDropboxBasicAuthHeader(),
    },
    body,
  });

  const payload = (await response.json()) as DropboxTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Failed to refresh Dropbox access token",
    );
  }

  if (!payload.access_token) {
    throw new Error("Dropbox refresh response did not include an access token");
  }

  return payload;
}

export async function fetchDropboxAccount(
  accessToken: string,
): Promise<DropboxAccountProfile> {
  const response = await fetch(DROPBOX_ACCOUNT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "null",
  });

  const payload = (await response.json()) as DropboxAccountProfile & {
    error_summary?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error_summary ?? "Failed to fetch Dropbox account profile",
    );
  }

  return payload;
}

export async function revokeDropboxToken(accessToken: string): Promise<void> {
  await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
