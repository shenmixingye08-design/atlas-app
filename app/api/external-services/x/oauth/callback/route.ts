import { consumeXOAuthState } from "@/lib/integrations/x/oauth-state";
import {
  completeXAccountOAuth,
  markXConnectionNeedsReconnect,
} from "@/lib/integrations/x/oauth-service";
import { X_OAUTH_USER_ERROR } from "@/lib/integrations/x/errors";
import {
  resolveXOAuthReturnPath,
  withXOAuthResultParams,
} from "@/lib/integrations/x/oauth-return-to";
import { recordXAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { notifyIntegrationError } from "@/lib/notifications/emitters";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

function redirectAfterXOauth(
  origin: string,
  returnTo: string | undefined,
  params: Record<string, string>,
): Response {
  const path = withXOAuthResultParams(resolveXOAuthReturnPath(returnTo), params);
  return Response.redirect(new URL(path, origin).toString(), 302);
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

  const statePayload = state ? consumeXOAuthState(state) : null;

  if (oauthError) {
    const { classifyOAuthFailure } = await import("@/lib/activation/oauth-errors");
    const reason = classifyOAuthFailure({ providerError: oauthError, hasCode: Boolean(code), hasState: Boolean(statePayload) });
    if (statePayload?.userId) {
      const { observeIntegration } = await import("@/lib/activation/observe");
      observeIntegration(statePayload.userId, "x", "failed", reason);
    }
    return redirectAfterXOauth(origin, statePayload?.returnTo, { x_error: "1", reason });
  }

  if (!code || !statePayload) {
    const { classifyOAuthFailure } = await import("@/lib/activation/oauth-errors");
    const reason = classifyOAuthFailure({ hasCode: Boolean(code), hasState: Boolean(statePayload) });
    if (statePayload?.userId) {
      const { observeIntegration } = await import("@/lib/activation/observe");
      observeIntegration(statePayload.userId, "x", "failed", reason);
    }
    return redirectAfterXOauth(origin, statePayload?.returnTo, { x_error: "1", reason });
  }

  const { userId, codeVerifier, returnTo } = statePayload;

  try {
    const connection = await completeXAccountOAuth(
      userId,
      code,
      codeVerifier,
      origin,
    );

    const { observeIntegration } = await import("@/lib/activation/observe");
    observeIntegration(userId, "x", "connected");

    return redirectAfterXOauth(origin, returnTo, {
      connected: connection.serviceId,
      username: connection.account?.username ?? connection.account?.email ?? "",
    });
  } catch (error) {
    const message = clientSafeMessage(error, X_OAUTH_USER_ERROR);
    // Never log tokens / auth codes — message only.
    console.error("[X OAuth callback]", message);
    markXConnectionError(userId, message);
    const { classifyOAuthFailure } = await import("@/lib/activation/oauth-errors");
    const { observeIntegration } = await import("@/lib/activation/observe");
    const reason = classifyOAuthFailure({
      hasCode: true,
      hasState: true,
      tokenSaved: false,
      callbackException: true,
    });
    observeIntegration(userId, "x", "failed", reason);
    return redirectAfterXOauth(origin, returnTo, { x_error: "1", reason });
  }
}
