import { consumeXOAuthState } from "@/lib/integrations/x/oauth-state";
import {
  completeXAccountOAuth,
  markXConnectionNeedsReconnect,
} from "@/lib/integrations/x/oauth-service";
import { X_OAUTH_USER_ERROR } from "@/lib/integrations/x/errors";
import { recordXAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
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

function redirectToSettings(
  origin: string,
  params: Record<string, string>,
): Response {
  const url = new URL("/settings/x", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

function markXConnectionError(userId: string, message: string): void {
  recordXAuthFailure(message, "x_oauth_callback");
  notifyIntegrationError(userId, {
    service: "X",
    message: X_OAUTH_USER_ERROR,
  });
  markXConnectionNeedsReconnect(userId, X_OAUTH_USER_ERROR);
}

export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectToSettings(origin, { x_error: "1" });
  }

  if (!code || !state) {
    return redirectToSettings(origin, { x_error: "1" });
  }

  const statePayload = consumeXOAuthState(state);
  if (!statePayload) {
    return redirectToSettings(origin, { x_error: "1" });
  }

  const { userId, codeVerifier } = statePayload;

  try {
    const connection = await completeXAccountOAuth(
      userId,
      code,
      codeVerifier,
      origin,
    );

    try {
      const { recordAuditLogSafe, auditRequestContext } = await import(
        "@/lib/owner/audit-log"
      );
      const ctx = auditRequestContext(request);
      // Formal contract: userId (actor), category, action, targetId, result, reason + request context.
      // Do not use actorUserId / targetType / summary / metadata — those are not RecordAuditLogInput fields.
      recordAuditLogSafe({
        userId,
        email: connection.account?.email ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        category: "integration",
        action: "x_connect",
        targetId: connection.serviceId,
        result: "success",
        reason: connection.account?.username
          ? `X OAuth connected (@${connection.account.username})`
          : "X OAuth connected",
      });
    } catch {
      // audit must not block OAuth success
    }

    return redirectToSettings(origin, {
      connected: connection.serviceId,
      username: connection.account?.username ?? connection.account?.email ?? "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : X_OAUTH_USER_ERROR;
    // Never log tokens / auth codes — message only.
    console.error("[X OAuth callback]", message);
    markXConnectionError(userId, message);
    try {
      const { recordAuditLogSafe, auditRequestContext } = await import(
        "@/lib/owner/audit-log"
      );
      const ctx = auditRequestContext(request);
      recordAuditLogSafe({
        userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        category: "integration",
        action: "x_connect",
        targetId: "x",
        result: "failure",
        reason: message,
      });
    } catch {
      // ignore
    }
    return redirectToSettings(origin, { x_error: "1" });
  }
}
