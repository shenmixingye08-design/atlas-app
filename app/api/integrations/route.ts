import { requireAuthenticatedUserId } from "@/lib/auth/require-authenticated-user";
import { rejectClientIdentityOverride } from "@/lib/auth/ownership";
import { isIntegrationProviderId } from "@/lib/integrations/domain";
import { integrationService } from "@/lib/integrations/integration-service";
import type {
  ConnectIntegrationInput,
  IntegrationProviderId,
} from "@/lib/integrations/types";

function parseConnectBody(
  body: unknown,
  userId: string,
): ConnectIntegrationInput | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be an object" };
  }

  const record = body as Record<string, unknown>;

  if (typeof record.provider !== "string" || !isIntegrationProviderId(record.provider)) {
    return { error: "provider is required and must be a supported integration" };
  }

  const provider = record.provider as IntegrationProviderId;

  if (record.name !== undefined) {
    if (typeof record.name !== "string" || !record.name.trim()) {
      return { error: "name must be a non-empty string when provided" };
    }
  }

  return {
    userId,
    provider,
    ...(typeof record.name === "string" ? { name: record.name.trim() } : {}),
  };
}

export async function GET(): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const catalog = await integrationService.getCatalogForUser(gate.userId);
  return Response.json(catalog);
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

  const identity = rejectClientIdentityOverride({
    authenticatedUserId: gate.userId,
    bodyUserId: (body as { userId?: unknown } | null)?.userId,
  });
  if (!identity.ok) return identity.response;

  const parsed = parseConnectBody(body, gate.userId);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const integration = await integrationService.connect(parsed);
    return Response.json(integration, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connection failed";
    if (message.includes("ご利用いただけません")) {
      return Response.json(
        {
          error: message,
          unsupported: true,
          softSuccess: false,
          connected: false,
          success: false,
        },
        { status: 403 },
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
