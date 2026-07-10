import type { CompanyTemplateId } from "@/lib/company-templates/types";
import { findCompanyTemplate } from "@/lib/company-templates/registry";
import { workflowMarketplaceService } from "@/lib/workflow-marketplace/marketplace-service";

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
  const { templateId } = await context.params;
  const id = parseTemplateId(templateId);

  if (!id) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  try {
    const result = await workflowMarketplaceService.installPackage(id);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to install package";
    return Response.json({ error: message }, { status: 500 });
  }
}
