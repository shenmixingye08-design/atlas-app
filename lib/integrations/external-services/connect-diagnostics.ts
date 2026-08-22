import { buildProductionDiagnosticId, logProductionApiError } from "@/lib/reliability/production-error-log";
import { redactSecrets, safeLog } from "@/lib/security/redact";

import {
  classifyXConnectStartError,
  inspectXOAuthEnvFlags,
} from "@/lib/integrations/x/oauth-start-config";

export const EXTERNAL_CONNECT_STAGES = [
  "auth",
  "service_validation",
  "hydration",
  "feature_access",
  "connect_access",
  "origin",
  "request_body",
  "manager_connect",
  "oauth_url",
] as const;

export type ExternalConnectFailedStage =
  (typeof EXTERNAL_CONNECT_STAGES)[number];

export function createExternalConnectDiagnosticId(): string {
  return buildProductionDiagnosticId("extconnect");
}

const CONNECT_ENV_VALUE_PAIR =
  /\b(X_CLIENT_SECRET|X_CLIENT_ID|X_REDIRECT_URI|X_OAUTH_REDIRECT_URI|CLERK_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|OAUTH_STATE_SECRET|ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY|ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY|APPLICATION_PASSWORD)\s*[:=]\s*\S+/gi;

export function sanitizeConnectErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown_error";
  const withoutEnvValues = raw.replace(CONNECT_ENV_VALUE_PAIR, "$1=[redacted]");
  return String(redactSecrets(withoutEnvValues)).slice(0, 240);
}

export function connectErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

export function logExternalConnectFailure(input: {
  diagnosticId: string;
  serviceId: string;
  failedStage: string;
  developerCode: string;
  error: unknown;
}): void {
  const sanitizedErrorMessage = sanitizeConnectErrorMessage(input.error);
  logProductionApiError({
    endpoint: `/api/external-services/${input.serviceId}/connect`,
    code: input.developerCode,
    diagnosticId: input.diagnosticId,
    failureStage: input.failedStage,
    subsystem: "integrations",
    message: sanitizedErrorMessage,
  });

  const flags =
    input.serviceId === "x" ? inspectXOAuthEnvFlags() : null;

  safeLog("error", "[external-connect] stage failure", {
    diagnosticId: input.diagnosticId,
    serviceId: input.serviceId,
    failedStage: input.failedStage,
    developerCode: input.developerCode,
    errorName: connectErrorName(input.error),
    sanitizedErrorMessage,
    ...(flags
      ? {
          xClientIdConfigured: flags.xClientIdConfigured,
          xClientSecretConfigured: flags.xClientSecretConfigured,
          xRedirectUriConfigured: flags.xRedirectUriConfigured,
        }
      : {}),
  });
}

export function logExternalConnectSuccess(input: {
  diagnosticId: string;
  serviceId: string;
  authorizeUrl?: string | null;
}): void {
  let authorizeHost: string | null = null;
  if (input.authorizeUrl) {
    try {
      authorizeHost = new URL(input.authorizeUrl).host;
    } catch {
      authorizeHost = null;
    }
  }
  safeLog("info", "[external-connect] start ok", {
    diagnosticId: input.diagnosticId,
    serviceId: input.serviceId,
    authorizationUrlPresent: Boolean(input.authorizeUrl),
    authorizeHost,
  });
}

export function classifyConnectFailure(
  serviceId: string,
  error: unknown,
): {
  developerCode: string;
  httpStatus: number;
  userMessage: string | null;
} {
  if (serviceId === "x") {
    return classifyXConnectStartError(error);
  }
  return {
    developerCode: "connect_unclassified",
    httpStatus: 500,
    userMessage: null,
  };
}
