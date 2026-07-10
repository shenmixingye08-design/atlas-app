import { findCompanyTemplate } from "@/lib/company-templates/registry";
import { workflowMarketplaceService } from "@/lib/workflow-marketplace/marketplace-service";

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { templateId } = await context.params;
  const template = findCompanyTemplate(templateId);

  if (!template) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  return Response.json(workflowMarketplaceService.getPackage(template.id));
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { templateId } = await context.params;
  const template = findCompanyTemplate(templateId);

  if (!template) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  try {
    const result = await workflowMarketplaceService.removePackage(template.id);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove package";
    return Response.json({ error: message }, { status: 400 });
  }
}
