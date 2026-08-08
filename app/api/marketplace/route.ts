import { requireAuthenticatedUserId } from "@/lib/auth/require-authenticated-user";
import { workflowMarketplaceService } from "@/lib/workflow-marketplace/marketplace-service";

export async function GET(): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const catalog = workflowMarketplaceService.getCatalogForUser(gate.userId);
  return Response.json(catalog);
}
