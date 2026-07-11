import { auth } from "@clerk/nextjs/server";

import { buildGoogleAccountAuthorizeUrl } from "@/lib/integrations/google/oauth";
import { GOOGLE_OAUTH_USER_ERROR } from "@/lib/integrations/google/errors";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

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

export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request);

  const { userId } = await auth();
  if (!userId) {
    return redirectToSettings(origin, { google_error: "1" });
  }

  try {
    const context = await resolveFeatureAccessContext();
    if (!isFeatureEnabled("google", context)) {
      recordGoogleAuthFailure("Google feature flag disabled", "google_oauth_authorize");
      return redirectToSettings(origin, { google_error: "1" });
    }

    const { requireBillingFeature, requireBillingExternalIntegration } =
      await import("@/lib/billing/access");
    const { listExternalServiceConnections } = await import(
      "@/lib/integrations/external-services/store"
    );
    const googleDenied = await requireBillingFeature(
      userId,
      "google_integration",
    );
    if (googleDenied) {
      return redirectToSettings(origin, {
        google_error: "1",
        plan: "standard",
      });
    }
    const connectedCount = listExternalServiceConnections(userId).filter(
      (row) => row.status === "connected",
    ).length;
    const googleConnected = listExternalServiceConnections(userId).some(
      (row) => row.serviceId === "google" && row.status === "connected",
    );
    if (!googleConnected) {
      const limitDenied = await requireBillingExternalIntegration(
        userId,
        connectedCount,
      );
      if (limitDenied) {
        return redirectToSettings(origin, { google_error: "1", plan: "limit" });
      }
    }

    const authorizeUrl = buildGoogleAccountAuthorizeUrl(origin, userId);
    return Response.redirect(authorizeUrl, 302);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : GOOGLE_OAUTH_USER_ERROR;
    recordGoogleAuthFailure(message, "google_oauth_authorize");
    return redirectToSettings(origin, { google_error: "1" });
  }
}
