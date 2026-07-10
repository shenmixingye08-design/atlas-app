import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { buildXAuthorizeUrl } from "@/lib/integrations/x/oauth";
import { X_OAUTH_USER_ERROR } from "@/lib/integrations/x/errors";
import { recordXAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

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

export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request);

  const { userId } = await auth();
  if (!userId) {
    return redirectToSettings(origin, { x_error: "1" });
  }

  try {
    const context = await resolveFeatureAccessContext();
    if (!isFeatureEnabled("x", context)) {
      recordXAuthFailure("X feature flag disabled", "x_oauth_authorize");
      return redirectToSettings(origin, { x_error: "1" });
    }

    const authorizeUrl = buildXAuthorizeUrl(origin, userId);
    return Response.redirect(authorizeUrl, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : X_OAUTH_USER_ERROR;
    recordXAuthFailure(message, "x_oauth_authorize");
    return redirectToSettings(origin, { x_error: "1" });
  }
}
