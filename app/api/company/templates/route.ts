import { companyTemplateService } from "@/lib/company-templates/service";

export async function GET(): Promise<Response> {
  return Response.json(companyTemplateService.listTemplates());
}
