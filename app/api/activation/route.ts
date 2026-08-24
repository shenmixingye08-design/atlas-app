import { auth } from "@clerk/nextjs/server";

import {
  getActivationView,
  recordActivationEvent,
  updateActivationProgress,
} from "@/lib/activation/service";
import { isActivationGoalId } from "@/lib/activation/privacy";
import type { ActivationDraftInputs } from "@/lib/activation/types";
import { ACTIVATION_PHASES } from "@/lib/activation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }
  const view = await getActivationView(userId);
  return Response.json(view);
}

export async function PATCH(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  delete body.userId;
  delete body.user_id;

  const selectedGoal = isActivationGoalId(body.selectedGoal)
    ? body.selectedGoal
    : undefined;
  const phase =
    typeof body.phase === "string" &&
    (ACTIVATION_PHASES as readonly string[]).includes(body.phase)
      ? (body.phase as (typeof ACTIVATION_PHASES)[number])
      : undefined;

  const draftInputs =
    body.draftInputs && typeof body.draftInputs === "object"
      ? (body.draftInputs as Record<string, unknown>)
      : undefined;

  const approval: ActivationDraftInputs["approval"] =
    draftInputs?.approval === "approval" || draftInputs?.approval === "auto"
      ? draftInputs.approval
      : undefined;
  const safeDraft: ActivationDraftInputs | undefined = draftInputs
    ? {
        theme: typeof draftInputs.theme === "string" ? draftInputs.theme.slice(0, 80) : undefined,
        audience:
          typeof draftInputs.audience === "string"
            ? draftInputs.audience.slice(0, 80)
            : undefined,
        tone: typeof draftInputs.tone === "string" ? draftInputs.tone.slice(0, 40) : undefined,
        count: typeof draftInputs.count === "string" ? draftInputs.count.slice(0, 8) : undefined,
        frequency:
          typeof draftInputs.frequency === "string"
            ? draftInputs.frequency.slice(0, 20)
            : undefined,
        hour: typeof draftInputs.hour === "string" ? draftInputs.hour.slice(0, 8) : undefined,
        approval,
        assignment:
          typeof draftInputs.assignment === "string"
            ? draftInputs.assignment.slice(0, 400)
            : undefined,
      }
    : undefined;

  if (selectedGoal) {
    await recordActivationEvent({
      userId,
      event: "goal_selected",
      idempotencyKey: `goal_selected:${userId}:${selectedGoal}`,
      selectedGoal,
      sourcePage: "/projects",
      success: true,
    });
  }

  await updateActivationProgress(userId, {
    selectedGoal,
    draftInputs: safeDraft,
    currentStep: typeof body.currentStep === "string" ? body.currentStep.slice(0, 40) : undefined,
    phase,
    checklistHidden:
      typeof body.checklistHidden === "boolean" ? body.checklistHidden : undefined,
    paywallShownAfterSuccess:
      typeof body.paywallShownAfterSuccess === "boolean"
        ? body.paywallShownAfterSuccess
        : undefined,
  });

  return Response.json(await getActivationView(userId));
}
