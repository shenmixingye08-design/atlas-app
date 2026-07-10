import { isIntegrationProviderId } from "@/lib/integrations/domain";
import { integrationService } from "@/lib/integrations/integration-service";
import type {
  ConnectIntegrationInput,
  IntegrationProviderId,
} from "@/lib/integrations/types";

function parseConnectBody(body: unknown): ConnectIntegrationInput | { error: string } {
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
    provider,
    ...(typeof record.name === "string" ? { name: record.name.trim() } : {}),
  };
}

export async function GET(): Promise<Response> {
  const catalog = await integrationService.getCatalog();
  return Response.json(catalog);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseConnectBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const integration = await integrationService.connect(parsed);
  return Response.json(integration, { status: 201 });
}
