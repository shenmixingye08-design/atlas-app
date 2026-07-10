import { companyTemplateService } from "@/lib/company-templates/service";
import type { CompanyTemplateId } from "@/lib/company-templates/types";
import { findCompanyTemplate } from "@/lib/company-templates/registry";

export async function GET(): Promise<Response> {
  const state = companyTemplateService.getActive();
  return Response.json({
    state: {
      templateId: state.id,
      selectedAt: state.selectedAt,
    },
    config: state,
  });
}

export async function POST(request: Request): Promise<Response> {
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

  const result = await companyTemplateService.selectTemplate(
    templateId as CompanyTemplateId,
  );

  return Response.json(result);
}
