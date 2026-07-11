import { consumeOAuthState } from "@/lib/integrations/google-drive/oauth-state";
import { completeGoogleAccountOAuth } from "@/lib/integrations/google/oauth-service";
import { GOOGLE_OAUTH_USER_ERROR } from "@/lib/integrations/google/errors";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { schedulePersistExternalAuth } from "@/lib/integrations/external-services/durable";
import { googleServiceDefinition } from "@/lib/integrations/google/definition";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { notifyIntegrationError } from "@/lib/notifications/emitters";
import { recordGoogleIntegrationUsage } from "@/lib/owner/popularity-ranking/telemetry";

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

function redirectToSettings(
  origin: string,
  params: Record<string, string>,
): Response {
  const url = new URL("/settings", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

function markGoogleConnectionError(userId: string, message: string): void {
  recordGoogleAuthFailure(message, "google_oauth_callback");
  notifyIntegrationError(userId, {
    service: "Google",
    message: GOOGLE_OAUTH_USER_ERROR,
  });
  const current = getExternalServiceConnection(userId, "google");
  saveExternalServiceConnection(userId, {
    ...createDefaultConnection(googleServiceDefinition),
    status: "error",
    connectedAt: current.connectedAt,
    lastUsedAt: current.lastUsedAt,
    scopes: [...googleServiceDefinition.plannedScopes],
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: GOOGLE_OAUTH_USER_ERROR,
  });
  schedulePersistExternalAuth(userId);
}

export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectToSettings(origin, { google_error: "1" });
  }

  if (!code || !state) {
    return redirectToSettings(origin, { google_error: "1" });
  }

  const statePayload = consumeOAuthState(state);
  if (!statePayload) {
    return redirectToSettings(origin, { google_error: "1" });
  }

  const { userId } = statePayload;

  try {
    const connection = await completeGoogleAccountOAuth(userId, code, origin);
    recordGoogleIntegrationUsage();

    const { recordAuditLogSafe, auditRequestContext } = await import(
      "@/lib/owner/audit-log"
    );
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      email: connection.account?.email ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "integration",
      action: "google_connect",
      targetId: "google",
      result: "success",
      reason: "Google OAuth connected",
    });

    return redirectToSettings(origin, {
      connected: connection.serviceId,
      account: connection.account?.email ?? connection.serviceName,
    });
  } catch (error) {
    console.error("[Google Account OAuth callback]", error);
    const message =
      error instanceof Error ? error.message : GOOGLE_OAUTH_USER_ERROR;
    markGoogleConnectionError(userId, message);
    const { recordAuditLogSafe, auditRequestContext } = await import(
      "@/lib/owner/audit-log"
    );
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "integration",
      action: "google_connect",
      targetId: "google",
      result: "failure",
      reason: message,
    });
    return redirectToSettings(origin, { google_error: "1" });
  }
}
