import type { ActivationGoalDefinition } from "./goals";
import type { ActivationChecklistItem, ActivationProgress } from "./types";
import type { TrialPolicy } from "./types";

export type ActivationViewResponse = {
  progress: ActivationProgress;
  checklist: ActivationChecklistItem[];
  nextHref: string;
  goals: ActivationGoalDefinition[];
  recommendedGoal: ActivationProgress["recommendedGoal"];
  trial: TrialPolicy;
  planId: string;
  shouldShowOnboarding: boolean;
  shouldShowResume: boolean;
  shouldShowChecklist: boolean;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error("記憶の案内を読み込めませんでした。");
  }
  return (await response.json()) as T;
}

export async function fetchActivationView(): Promise<ActivationViewResponse> {
  const response = await fetch("/api/activation", { cache: "no-store" });
  return parseJson<ActivationViewResponse>(response);
}

export async function patchActivationProgress(
  patch: Partial<
    Pick<
      ActivationProgress,
      | "selectedGoal"
      | "draftInputs"
      | "currentStep"
      | "phase"
      | "checklistHidden"
      | "paywallShownAfterSuccess"
    >
  >,
): Promise<ActivationViewResponse> {
  const response = await fetch("/api/activation", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson<ActivationViewResponse>(response);
}

export async function postActivationClientEvent(input: {
  event:
    | "onboarding_started"
    | "goal_selected"
    | "quick_start_selected"
    | "onboarding_skipped"
    | "onboarding_completed"
    | "paywall_viewed";
  selectedGoal?: ActivationProgress["selectedGoal"];
  sourcePage?: string;
}): Promise<void> {
  await fetch("/api/activation/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => undefined);
}
