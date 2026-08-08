import { requireAuthenticatedUserId } from "@/lib/auth/require-authenticated-user";
import type { CompanyTemplateId } from "@/lib/company-templates/types";
import { findCompanyTemplate } from "@/lib/company-templates/registry";
import { workflowMarketplaceService } from "@/lib/workflow-marketplace/marketplace-service";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

function parseTemplateId(value: string): CompanyTemplateId | null {
  return findCompanyTemplate(value)?.id ?? null;
}

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const { templateId } = await context.params;
  const id = parseTemplateId(templateId);

  if (!id) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  try {
    const result = await workflowMarketplaceService.updatePackageForUser(
      gate.userId,
      id,
    );
    return Response.json(result);
  } catch (error) {
    const message =
      clientSafeMessage(error, "Failed to update package");
    return Response.json({ error: message }, { status: 400 });
  }
}
