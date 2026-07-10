import { integrationService } from "@/lib/integrations/integration-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const integration = await integrationService.getById(id);

  if (!integration) {
    return Response.json({ error: "Integration not found" }, { status: 404 });
  }

  return Response.json(integration);
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const deleted = await integrationService.disconnect(id);

  if (!deleted) {
    return Response.json({ error: "Integration not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
