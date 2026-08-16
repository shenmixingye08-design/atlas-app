import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import {
  getApiUsageMonitoringSnapshot,
  parseApiUsageBudgetUpdate,
  updateApiUsageBudget,
} from "@/lib/owner/api-usage/service";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(getApiUsageMonitoringSnapshot());
}

export async function PATCH(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseApiUsageBudgetUpdate(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const snapshot = updateApiUsageBudget(parsed.providerId, parsed.budgetUsd);
  return Response.json(snapshot);
}
