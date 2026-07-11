import { auth } from "@clerk/nextjs/server";

import { isExternalServiceId } from "@/lib/integrations/external-services/registry";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  recordDropboxIntegrationUsage,
  recordGoogleIntegrationUsage,
} from "@/lib/owner/popularity-ranking/telemetry";

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
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serviceId } = await context.params;

  if (!isExternalServiceId(serviceId)) {
    return Response.json({ error: "Unknown service" }, { status: 404 });
  }

  try {
    await ensureExternalAuthHydrated(userId);
    const accessContext = await resolveFeatureAccessContext();

    const {
      requireBillingExternalIntegration,
      requireBillingFeature,
    } = await import("@/lib/billing/access");
    const { listExternalServiceConnections } = await import(
      "@/lib/integrations/external-services/store"
    );
    const connectedCount = listExternalServiceConnections(userId).filter(
      (row) => row.status === "connected",
    ).length;

    if (serviceId === "google") {
      const googleDenied = await requireBillingFeature(
        userId,
        "google_integration",
      );
      if (googleDenied) return googleDenied;
    }

    const limitDenied = await requireBillingExternalIntegration(
      userId,
      connectedCount,
    );
    if (limitDenied) return limitDenied;

    const origin = resolveOrigin(request);
    const result = await externalServiceManager.connect(
      userId,
      serviceId,
      origin,
      accessContext,
    );

    if (result.connection.status === "connected") {
      if (serviceId === "google") {
        recordGoogleIntegrationUsage();
      }
      if (serviceId === "dropbox") {
        recordDropboxIntegrationUsage();
      }
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connection failed";
    const status = message.includes("ご利用いただけません") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
