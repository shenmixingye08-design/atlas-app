import { auth } from "@clerk/nextjs/server";

import { workflowMarketplaceService } from "@/lib/workflow-marketplace/marketplace-service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const catalog = workflowMarketplaceService.getCatalog(userId);
  return Response.json(catalog);
}
