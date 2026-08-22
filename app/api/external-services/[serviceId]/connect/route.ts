import { auth } from "@clerk/nextjs/server";

import { isExternalServiceId } from "@/lib/integrations/external-services/registry";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import {
  classifyConnectFailure,
  createExternalConnectDiagnosticId,
  logExternalConnectFailure,
  logExternalConnectSuccess,
  type ExternalConnectFailedStage,
} from "@/lib/integrations/external-services/connect-diagnostics";
import { inspectXConnectStartReadiness } from "@/lib/integrations/x/oauth-start-config";
import {
  isExternalServiceConnectable,
  unsupportedExternalServiceMessage,
} from "@/lib/integrations/production-capability";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  recordDropboxIntegrationUsage,
  recordGoogleIntegrationUsage,
} from "@/lib/owner/popularity-ranking/telemetry";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

type RouteContext = {
  params: Promise<{ serviceId: string }>;
};

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const diagnosticId = createExternalConnectDiagnosticId();
  let failedStage: ExternalConnectFailedStage | "unknown" = "auth";
  let serviceId = "unknown";

  try {
    failedStage = "auth";
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    failedStage = "service_validation";
    ({ serviceId } = await context.params);

    if (!isExternalServiceId(serviceId)) {
      return Response.json({ error: "Unknown service" }, { status: 404 });
    }

    // N-04: fail-closed before billing / stub connect.
    if (!isExternalServiceConnectable(serviceId)) {
      return Response.json(
        {
          error: unsupportedExternalServiceMessage(serviceId),
          unsupported: true,
          softSuccess: false,
          connected: false,
          success: false,
        },
        { status: 403 },
      );
    }

    failedStage = "hydration";
    await ensureExternalAuthHydrated(userId);

    failedStage = "feature_access";
    const accessContext = await resolveFeatureAccessContext();

    failedStage = "connect_access";
    const { billingDenialResponse } = await import("@/lib/billing/access");
    const { evaluateExternalServiceConnectAccess } = await import(
      "@/lib/integrations/external-services/connect-access"
    );
    const { denial } = await evaluateExternalServiceConnectAccess(
      userId,
      serviceId,
    );
    if (denial) return billingDenialResponse(denial);

    failedStage = "origin";
    const origin = resolveOrigin(request);

    failedStage = "request_body";
    let returnTo: string | undefined;
    try {
      const json = (await request.json()) as { returnTo?: unknown } | null;
      if (typeof json?.returnTo === "string") {
        returnTo = json.returnTo;
      }
    } catch {
      // Empty body is valid — settings page still returns to /settings/x.
    }

    if (serviceId === "x") {
      failedStage = "oauth_url";
      const readiness = inspectXConnectStartReadiness();
      if (!readiness.ready) {
        const developerCode = readiness.developerCode ?? "x_connect_not_ready";
        logExternalConnectFailure({
          diagnosticId,
          serviceId,
          failedStage,
          developerCode,
          error: new Error(developerCode),
        });
        return Response.json(
          {
            error: readiness.userMessage,
            diagnosticId,
            failedStage,
            developerCode,
          },
          { status: 503 },
        );
      }
    } else {
      failedStage = "manager_connect";
    }
    const result = await externalServiceManager.connect(
      userId,
      serviceId,
      origin,
      accessContext,
      returnTo ? { returnTo } : undefined,
    );

    if (result.connection.status === "connected") {
      if (serviceId === "google") {
        recordGoogleIntegrationUsage();
      }
      if (serviceId === "dropbox") {
        recordDropboxIntegrationUsage();
      }
    }

    logExternalConnectSuccess({
      diagnosticId,
      serviceId,
      authorizeUrl: result.authorizeUrl,
    });

    return Response.json({ ...result, diagnosticId });
  } catch (error) {
    const classified = classifyConnectFailure(serviceId, error);
    logExternalConnectFailure({
      diagnosticId,
      serviceId,
      failedStage,
      developerCode: classified.developerCode,
      error,
    });

    if (serviceId === "x" && classified.userMessage) {
      return Response.json(
        {
          error: classified.userMessage,
          diagnosticId,
          failedStage,
          developerCode: classified.developerCode,
        },
        { status: classified.httpStatus },
      );
    }

    const message = clientSafeMessage(error, "Connection failed");
    const status = message.includes("ご利用いただけません")
      ? 403
      : classified.httpStatus || 500;
    return Response.json(
      {
        error: message,
        diagnosticId,
        failedStage,
        developerCode: classified.developerCode,
      },
      { status },
    );
  }
}
