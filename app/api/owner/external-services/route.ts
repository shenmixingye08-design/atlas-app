import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import {
  getOwnerExternalServicesSnapshot,
  parseOwnerExternalServiceReconnectBody,
  reconnectOwnerExternalService,
} from "@/lib/owner/external-services";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(getOwnerExternalServicesSnapshot());
}

export async function POST(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseOwnerExternalServiceReconnectBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await reconnectOwnerExternalService({
      serviceId: parsed.serviceId,
      requestOrigin: resolveOrigin(request),
    });
    return Response.json(result);
  } catch (error) {
    const message =
      clientSafeMessage(error, "Reconnect failed");
    const status =
      message === "Unauthorized"
        ? 401
        : message.includes("ご利用いただけません")
          ? 403
          : 500;
    return Response.json({ error: message }, { status });
  }
}
