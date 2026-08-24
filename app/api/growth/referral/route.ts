import { auth } from "@clerk/nextjs/server";

import { getRevenueMaxSnapshot } from "@/lib/growth/revenue-max/service";
import { issueReferral } from "@/lib/growth/acquisition/service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snapshot = await getRevenueMaxSnapshot(userId);
  if (!snapshot.state.firstSuccessAt) {
    return Response.json({ error: "初回成功後に発行できます", reward: "未設定" }, { status: 400 });
  }
  const result = await issueReferral(userId, snapshot.state.firstSuccessAt);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snapshot = await getRevenueMaxSnapshot(userId);
  const result = await issueReferral(userId, snapshot.state.firstSuccessAt);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}
