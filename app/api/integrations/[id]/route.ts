import { ownershipDeniedResponse } from "@/lib/auth/ownership";
import { requireAuthenticatedUserId } from "@/lib/auth/require-authenticated-user";
import { integrationService } from "@/lib/integrations/integration-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const integration = await integrationService.getByIdForUser(id, gate.userId);

  if (!integration) {
    return ownershipDeniedResponse(404);
  }

  return Response.json(integration);
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const deleted = await integrationService.disconnectForUser(id, gate.userId);

  if (!deleted) {
    return ownershipDeniedResponse(404);
  }

  return new Response(null, { status: 204 });
}
