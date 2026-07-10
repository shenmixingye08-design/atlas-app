import type {
  OnboardingEntryMode,
  OnboardingTaskId,
  UserOnboardingState,
} from "@/lib/user-profile/types";

const TASK_IDS: OnboardingTaskId[] = [
  "sns",
  "blog",
  "sales_material",
  "email",
  "schedule",
  "files",
  "ai_chat",
  "company",
  "undecided",
];

function isOnboardingTaskId(value: unknown): value is OnboardingTaskId {
  return typeof value === "string" && TASK_IDS.includes(value as OnboardingTaskId);
}

function isEntryMode(value: unknown): value is OnboardingEntryMode {
  return value === "guide" || value === "skip" || value === "later";
}

export const DEFAULT_ONBOARDING_STATE: UserOnboardingState = {
  showOnboarding: true,
  completedOnboarding: false,
  preferredTasks: [],
  createdAt: null,
  deferredAt: null,
};

export function normalizeOnboardingState(
  raw: Partial<UserOnboardingState> | undefined,
): UserOnboardingState | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const preferredTasks = Array.isArray(raw.preferredTasks)
    ? raw.preferredTasks.filter(isOnboardingTaskId)
    : [];

  return {
    showOnboarding: raw.showOnboarding !== false,
    completedOnboarding: raw.completedOnboarding === true,
    preferredTasks,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : null,
    entryMode: isEntryMode(raw.entryMode) ? raw.entryMode : undefined,
    deferredAt: typeof raw.deferredAt === "string" ? raw.deferredAt : null,
    firstExperienceCompleted: raw.firstExperienceCompleted === true,
    firstExperienceDate:
      typeof raw.firstExperienceDate === "string" ? raw.firstExperienceDate : null,
    firstTaskCategory:
      typeof raw.firstTaskCategory === "string" ? raw.firstTaskCategory : null,
    firstTaskDuration:
      typeof raw.firstTaskDuration === "number" ? raw.firstTaskDuration : null,
    firstExperienceDeferred: raw.firstExperienceDeferred === true,
    firstExperienceTaskId:
      typeof raw.firstExperienceTaskId === "string" ? raw.firstExperienceTaskId : null,
  };
}
