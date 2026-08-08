import { requireAuthenticatedUserId } from "@/lib/auth/require-authenticated-user";
import { findCompanyTemplate } from "@/lib/company-templates/registry";
import { workflowMarketplaceService } from "@/lib/workflow-marketplace/marketplace-service";

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const { templateId } = await context.params;
  const template = findCompanyTemplate(templateId);

  if (!template) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  return Response.json(
    workflowMarketplaceService.getPackageForUser(gate.userId, template.id),
  );
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const { templateId } = await context.params;
  const template = findCompanyTemplate(templateId);

  if (!template) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  try {
    const result = await workflowMarketplaceService.removePackageForUser(
      gate.userId,
      template.id,
    );
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove package";
    return Response.json({ error: message }, { status: 400 });
  }
}
