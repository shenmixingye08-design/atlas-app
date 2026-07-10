import { auth } from "@clerk/nextjs/server";

import { isExternalServiceId } from "@/lib/integrations/external-services/registry";
import { externalServiceManager } from "@/lib/integrations/external-services/service";

type RouteContext = {
  params: Promise<{ serviceId: string }>;
};

export async function DELETE(
  _request: Request,
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
  return Response.json(connection);
}
