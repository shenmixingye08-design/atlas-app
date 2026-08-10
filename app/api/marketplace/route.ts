import { requireAuthenticatedUserId } from "@/lib/auth/require-authenticated-user";
import { ensureActiveCompanyHydrated } from "@/lib/company-templates/durable";
import { workflowMarketplaceService } from "@/lib/workflow-marketplace/marketplace-service";

export async function GET(): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  await ensureActiveCompanyHydrated(gate.userId);
  const catalog = workflowMarketplaceService.getCatalogForUser(gate.userId);
  return Response.json(catalog);
}
