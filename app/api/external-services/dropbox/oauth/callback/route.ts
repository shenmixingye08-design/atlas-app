import { consumeDropboxOAuthState } from "@/lib/integrations/dropbox/oauth-state";
import { completeDropboxAccountOAuth } from "@/lib/integrations/dropbox/oauth-service";
import { DROPBOX_OAUTH_USER_ERROR } from "@/lib/integrations/dropbox/errors";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { dropboxServiceDefinition } from "@/lib/integrations/dropbox/definition";
import { recordDropboxAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { notifyIntegrationError } from "@/lib/notifications/emitters";

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

function redirectToFiles(
  origin: string,
  params: Record<string, string>,
): Response {
  const url = new URL("/workspace/drive", origin);
  url.searchParams.set("provider", "dropbox");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

function markDropboxConnectionError(userId: string, message: string): void {
  recordDropboxAuthFailure(message, "dropbox_oauth_callback");
  notifyIntegrationError(userId, {
    service: "Dropbox",
    message: DROPBOX_OAUTH_USER_ERROR,
  });
  const current = getExternalServiceConnection(userId, "dropbox");
  saveExternalServiceConnection(userId, {
    ...createDefaultConnection(dropboxServiceDefinition),
    status: "error",
    connectedAt: current.connectedAt,
    lastUsedAt: current.lastUsedAt,
    scopes: [...dropboxServiceDefinition.plannedScopes],
    features: [...dropboxServiceDefinition.plannedFeatures],
    errorMessage: DROPBOX_OAUTH_USER_ERROR,
  });
}

export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectToFiles(origin, { dropbox_error: "1" });
  }

  if (!code || !state) {
    return redirectToFiles(origin, { dropbox_error: "1" });
  }

  const statePayload = consumeDropboxOAuthState(state);
  if (!statePayload) {
    return redirectToFiles(origin, { dropbox_error: "1" });
  }

  const { userId, codeVerifier } = statePayload;

  try {
    await completeDropboxAccountOAuth(userId, code, codeVerifier, origin);
    const { recordAuditLogSafe, auditRequestContext } = await import(
      "@/lib/owner/audit-log"
    );
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "integration",
      action: "dropbox_connect",
      targetId: "dropbox",
      result: "success",
      reason: "Dropbox OAuth connected",
    });
    return redirectToFiles(origin, { connected: "dropbox" });
  } catch (error) {
    console.error("[Dropbox OAuth callback]", error);
    const message =
      error instanceof Error ? error.message : DROPBOX_OAUTH_USER_ERROR;
    markDropboxConnectionError(userId, message);
    const { recordAuditLogSafe, auditRequestContext } = await import(
      "@/lib/owner/audit-log"
    );
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "integration",
      action: "dropbox_connect",
      targetId: "dropbox",
      result: "failure",
      reason: message,
    });
    return redirectToFiles(origin, { dropbox_error: "1" });
  }
}
