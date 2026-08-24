import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { ensureRevenueAgentHydrated } from "@/lib/owner/revenue-agent/durable";
import {
  buildOwnerImproveSnapshot,
  recordImproveDecision,
} from "@/lib/growth/revenue-max/owner";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  await ensureRevenueAgentHydrated();
  return Response.json(buildOwnerImproveSnapshot());
}

export async function POST(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const decision = body.decision === "approved" || body.decision === "rejected"
    ? body.decision
    : null;
  if (!decision) {
    return Response.json({ error: "approved または rejected が必要です" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "unknown";
  const recorded = recordImproveDecision(id, decision);
  return Response.json({
    ok: true,
    applied: recorded.applied,
    note: recorded.note,
    decision,
  });
}
