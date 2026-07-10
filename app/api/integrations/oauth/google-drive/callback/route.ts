import { consumeOAuthState } from "@/lib/integrations/google-drive/oauth-state";
import { integrationService } from "@/lib/integrations/integration-service";

function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

function redirectToIntegrations(
  origin: string,
  params: Record<string, string>,
): Response {
  const url = new URL("/integrations", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectToIntegrations(origin, {
      error: `Google authorization was denied (${oauthError}).`,
    });
  }

  if (!code || !state) {
    return redirectToIntegrations(origin, {
      error: "Missing Google OAuth code or state.",
    });
  }

  if (!consumeOAuthState(state)) {
    return redirectToIntegrations(origin, {
      error: "Invalid or expired OAuth state. Please try connecting again.",
    });
  }

  try {
    const integration = await integrationService.completeGoogleDriveOAuth(
      code,
      origin,
    );

    return redirectToIntegrations(origin, {
      connected: integration.provider,
      account: integration.metadata?.accountEmail ?? integration.name,
    });
  } catch (error) {
    console.error("[Google OAuth callback]", error);
    const message =
      error instanceof Error ? error.message : "Google Drive connection failed";

    return redirectToIntegrations(origin, { error: message });
  }
}
