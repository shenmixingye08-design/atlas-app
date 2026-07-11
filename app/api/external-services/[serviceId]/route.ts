import { auth } from "@clerk/nextjs/server";

import { isExternalServiceId } from "@/lib/integrations/external-services/registry";
import { externalServiceManager } from "@/lib/integrations/external-services/service";

type RouteContext = {
  params: Promise<{ serviceId: string }>;
};

export async function DELETE(
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

  const connection = await externalServiceManager.disconnect(userId, serviceId);

  const { recordAuditLogSafe, auditRequestContext } = await import(
    "@/lib/owner/audit-log"
  );
  const ctx = auditRequestContext(request);
  const action =
    serviceId === "google"
      ? "google_disconnect"
      : serviceId === "dropbox"
        ? "dropbox_disconnect"
        : "owner_action";
  recordAuditLogSafe({
    userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    category: "integration",
    action: serviceId === "google" || serviceId === "dropbox" ? action : `${serviceId}_disconnect`,
    targetId: serviceId,
    result: "success",
    reason: `${serviceId} disconnected`,
  });

  return Response.json(connection);
}
