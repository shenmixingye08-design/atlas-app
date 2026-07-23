import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getAutomationExecutionLogSnapshot } from "@/lib/automations/execution-log";

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const url = new URL(request.url);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
  return Response.json(getAutomationExecutionLogSnapshot(limit));
}
