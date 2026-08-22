import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { buildXAuthorizeUrl } from "@/lib/integrations/x/oauth";
import { X_OAUTH_USER_ERROR } from "@/lib/integrations/x/errors";
import {
  resolveXOAuthReturnPath,
  withXOAuthResultParams,
} from "@/lib/integrations/x/oauth-return-to";
import { recordXAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
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

export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request);
  const requestedReturnTo = new URL(request.url).searchParams.get("returnTo") ?? undefined;

  const { userId } = await auth();
  if (!userId) {
    return redirectAfterXOauth(origin, requestedReturnTo, { x_error: "1" });
  }

  try {
    const context = await resolveFeatureAccessContext();
    if (!isFeatureEnabled("x", context)) {
      recordXAuthFailure("X feature flag disabled", "x_oauth_authorize");
      return redirectAfterXOauth(origin, requestedReturnTo, { x_error: "1" });
    }

    const { evaluateExternalServiceConnectAccess } = await import(
      "@/lib/integrations/external-services/connect-access"
    );
    const { denial } = await evaluateExternalServiceConnectAccess(userId, "x");
    if (denial) {
      return redirectAfterXOauth(origin, requestedReturnTo, {
        x_error: "1",
        plan: denial.kind === "limit" ? "limit" : "required",
      });
    }

    const authorizeUrl = buildXAuthorizeUrl(origin, userId, {
      returnTo: requestedReturnTo,
    });
    return Response.redirect(authorizeUrl, 302);
  } catch (error) {
    const message = clientSafeMessage(error, X_OAUTH_USER_ERROR);
    recordXAuthFailure(message, "x_oauth_authorize");
    return redirectAfterXOauth(origin, requestedReturnTo, { x_error: "1" });
  }
}
