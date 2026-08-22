/**
 * X OAuth start-time configuration — presence flags only, never values.
 * Used by connect diagnostics and the public health probe.
 */

import {
  EXPECTED_X_PRODUCTION_REDIRECT_URI,
  isXRedirectUriConfigured,
} from "./config";

export { EXPECTED_X_PRODUCTION_REDIRECT_URI };

export const X_CONNECT_USER_CONFIG_MESSAGE =
  "X連携を開始できません。運営が設定を確認しています。";

export const X_CONNECT_USER_RETRY_MESSAGE =
  "X連携を開始できませんでした。自動で再試行しています。";

export type XOAuthEnvFlags = {
  xClientIdConfigured: boolean;
  xClientSecretConfigured: boolean;
  xRedirectUriConfigured: boolean;
  oauthStateSecretConfigured: boolean;
};

export type XConnectStartClassification = {
  developerCode: string;
  httpStatus: 400 | 403 | 500 | 503;
  userMessage: string;
};

type EnvLookup = Record<string, string | undefined>;

export function isVercelProductionEnv(
  env: EnvLookup = process.env,
): boolean {
  return env.VERCEL_ENV === "production";
}

export function inspectXOAuthEnvFlags(
  env: EnvLookup = process.env,
): XOAuthEnvFlags {
  return {
    xClientIdConfigured: Boolean(env.X_CLIENT_ID?.trim()),
    xClientSecretConfigured: Boolean(env.X_CLIENT_SECRET?.trim()),
    xRedirectUriConfigured: isXRedirectUriConfigured(env),
    oauthStateSecretConfigured: Boolean(
      env.OAUTH_STATE_SECRET?.trim() || env.CLERK_SECRET_KEY?.trim(),
    ),
  };
}

export function probeXOAuthConnectConfig(
  env: EnvLookup = process.env,
): {
  flags: XOAuthEnvFlags;
  expectedRedirectUri: string;
  usingCanonicalProductionRedirect: boolean;
  canStartAuthorize: boolean;
  canCompleteOAuth: boolean;
} {
  const flags = inspectXOAuthEnvFlags(env);
  const usingCanonicalProductionRedirect =
    isVercelProductionEnv(env) && !flags.xRedirectUriConfigured;
  const canStartAuthorize =
    flags.xClientIdConfigured &&
    (flags.xRedirectUriConfigured || usingCanonicalProductionRedirect) &&
    flags.oauthStateSecretConfigured;
  return {
    flags,
    expectedRedirectUri: EXPECTED_X_PRODUCTION_REDIRECT_URI,
    usingCanonicalProductionRedirect,
    canStartAuthorize,
    canCompleteOAuth: canStartAuthorize && flags.xClientSecretConfigured,
  };
}

export function inspectXConnectStartReadiness(
  env: EnvLookup = process.env,
): {
  ready: boolean;
  developerCode: string | null;
  userMessage: string | null;
  flags: XOAuthEnvFlags;
} {
  const flags = inspectXOAuthEnvFlags(env);
  if (!flags.xClientIdConfigured) {
    return {
      ready: false,
      developerCode: "x_client_id_missing",
      userMessage: X_CONNECT_USER_CONFIG_MESSAGE,
      flags,
    };
  }
  if (!flags.xRedirectUriConfigured && !isVercelProductionEnv(env)) {
    return {
      ready: false,
      developerCode: "x_redirect_uri_missing",
      userMessage: X_CONNECT_USER_CONFIG_MESSAGE,
      flags,
    };
  }
  if (!flags.oauthStateSecretConfigured) {
    return {
      ready: false,
      developerCode: "x_oauth_state_secret_missing",
      userMessage: X_CONNECT_USER_CONFIG_MESSAGE,
      flags,
    };
  }
  return {
    ready: true,
    developerCode: null,
    userMessage: null,
    flags,
  };
}

export function classifyXConnectStartError(
  error: unknown,
): XConnectStartClassification {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/X_CLIENT_ID/.test(message)) {
    return {
      developerCode: "x_client_id_missing",
      httpStatus: 503,
      userMessage: X_CONNECT_USER_CONFIG_MESSAGE,
    };
  }
  if (/X_REDIRECT_URI|X_OAUTH_REDIRECT_URI|Do not derive redirect_uri/.test(message)) {
    return {
      developerCode: "x_redirect_uri_missing",
      httpStatus: 503,
      userMessage: X_CONNECT_USER_CONFIG_MESSAGE,
    };
  }
  if (/OAuth state secret/.test(message)) {
    return {
      developerCode: "x_oauth_state_secret_missing",
      httpStatus: 503,
      userMessage: X_CONNECT_USER_CONFIG_MESSAGE,
    };
  }
  if (/Request origin is required/.test(message)) {
    return {
      developerCode: "x_request_origin_missing",
      httpStatus: 400,
      userMessage: X_CONNECT_USER_RETRY_MESSAGE,
    };
  }
  return {
    developerCode: "x_connect_unclassified",
    httpStatus: 500,
    userMessage: X_CONNECT_USER_RETRY_MESSAGE,
  };
}
