import { auth } from "@clerk/nextjs/server";

import {
  getRevenueMaxSnapshot,
  handleRevenueMaxAction,
} from "@/lib/growth/revenue-max/service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await getRevenueMaxSnapshot(userId));
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = await handleRevenueMaxAction(userId, body);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, snapshot: await getRevenueMaxSnapshot(userId) });
}
