import { auth } from "@clerk/nextjs/server";

import { isActivationEventName, isActivationGoalId } from "@/lib/activation/privacy";
import { recordActivationEvent } from "@/lib/activation/service";

const CLIENT_EVENTS = new Set([
  "onboarding_started",
  "goal_selected",
  "quick_start_selected",
  "onboarding_skipped",
  "onboarding_completed",
  "paywall_viewed",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "内容を確認できませんでした。" }, { status: 400 });
  }

  if (!isActivationEventName(body.event) || !CLIENT_EVENTS.has(body.event)) {
    return Response.json({ error: "この操作は記録できません。" }, { status: 400 });
  }

  const result = await recordActivationEvent({
    userId,
    event: body.event,
    idempotencyKey:
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
        ? body.idempotencyKey
        : `${body.event}:${userId}:${isActivationGoalId(body.selectedGoal) ? body.selectedGoal : "none"}`,
    selectedGoal: isActivationGoalId(body.selectedGoal) ? body.selectedGoal : null,
    sourcePage:
      typeof body.sourcePage === "string" ? body.sourcePage.slice(0, 120) : "/projects",
    success: true,
  });

  return Response.json({ recorded: result.recorded });
}
