import { workflowMarketplaceService } from "@/lib/workflow-marketplace/marketplace-service";

export async function GET(): Promise<Response> {
  const catalog = workflowMarketplaceService.getCatalog();
  return Response.json(catalog);
}
