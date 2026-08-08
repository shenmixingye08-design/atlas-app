import { requireAuthenticatedUserId } from "@/lib/auth/require-authenticated-user";
import { companyTemplateService } from "@/lib/company-templates/service";
import type { CompanyTemplateId } from "@/lib/company-templates/types";
import { findCompanyTemplate } from "@/lib/company-templates/registry";

export async function GET(): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const state = companyTemplateService.getActiveForUser(gate.userId);
  return Response.json({
    state: {
      templateId: state.id,
      selectedAt: state.selectedAt,
    },
    config: state,
  });
}

export async function POST(request: Request): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const templateId = (body as { templateId?: unknown }).templateId;

  if (typeof templateId !== "string" || !findCompanyTemplate(templateId)) {
    return Response.json({ error: "Valid templateId is required" }, { status: 400 });
  }

  const result = await companyTemplateService.selectTemplateForUser(
    gate.userId,
    templateId as CompanyTemplateId,
  );

  return Response.json(result);
}
