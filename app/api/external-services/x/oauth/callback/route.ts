import { consumeXOAuthState } from "@/lib/integrations/x/oauth-state";
import { completeXAccountOAuth } from "@/lib/integrations/x/oauth-service";
import { X_OAUTH_USER_ERROR } from "@/lib/integrations/x/errors";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { xServiceDefinition } from "@/lib/integrations/x/definition";
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
  const current = getExternalServiceConnection(userId, "x");
  saveExternalServiceConnection(userId, {
    ...createDefaultConnection(xServiceDefinition),
    status: "error",
    connectedAt: current.connectedAt,
    lastUsedAt: current.lastUsedAt,
    scopes: [...xServiceDefinition.plannedScopes],
    features: [...xServiceDefinition.plannedFeatures],
    errorMessage: X_OAUTH_USER_ERROR,
  });
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

    return redirectToSettings(origin, {
      connected: connection.serviceId,
      username: connection.account?.username ?? connection.account?.email ?? "",
    });
  } catch (error) {
    console.error("[X OAuth callback]", error);
    const message = error instanceof Error ? error.message : X_OAUTH_USER_ERROR;
    markXConnectionError(userId, message);
    return redirectToSettings(origin, { x_error: "1" });
  }
}
