import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import {
  getOwnerSprintSnapshot,
  markManualPost,
  setLpStatus,
} from "@/lib/growth/first-revenue/service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(await getOwnerSprintSnapshot());
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
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "approve_lp") {
    await setLpStatus("approved");
    return Response.json({ ok: true });
  }
  if (action === "draft_lp") {
    await setLpStatus("draft");
    return Response.json({ ok: true });
  }
  if (action === "manual_publish") {
    const result = await markManualPost(String(body.contentId ?? ""), String(body.postUrl ?? ""));
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "未知の操作です" }, { status: 400 });
}
