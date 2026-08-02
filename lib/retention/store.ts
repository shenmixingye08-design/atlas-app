"use client";

import type { OnboardingTaskId } from "@/lib/user-profile/types";

import { RETENTION_DAY_PLAN } from "./day-plan";
import type {
  RetentionDayId,
  RetentionDayProgress,
  RetentionIntegrationId,
  RetentionRoleId,
  RetentionState,
  RetentionSurveyAnswers,
  RetentionWizardProfile,
} from "./types";

const STORAGE_KEY = "atlas-retention-first-win-v1";

const DEFAULT_WIZARD: RetentionWizardProfile = {
  workDescription: "",
  company: "",
  roleId: "sales",
  preferredTasks: ["sales_material"],
  integrations: [],
  completedAt: null,
};

function defaultDayPlan(): RetentionDayProgress[] {
  return RETENTION_DAY_PLAN.map((item) => ({
    day: item.day,
    completedAt: null,
    skippedAt: null,
  }));
}

export const DEFAULT_RETENTION_STATE: RetentionState = {
  version: 1,
  wizard: { ...DEFAULT_WIZARD },
  dayPlan: defaultDayPlan(),
  survey: null,
  surveyDismissedAt: null,
  successDayKeys: [],
  cohort: {
    retainedDay7: null,
    retainedDay14: null,
    retainedDay30: null,
    firstActiveAt: null,
    lastActiveAt: null,
    activeDayKeys: [],
  },
  notificationsSent: {},
  updatedAt: new Date(0).toISOString(),
};

type MemoryScope = typeof globalThis & {
  __atlasRetentionState?: RetentionState;
};

function memoryState(): RetentionState {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasRetentionState) {
    scope.__atlasRetentionState = structuredClone(DEFAULT_RETENTION_STATE);
  }
  return scope.__atlasRetentionState;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function isRoleId(value: unknown): value is RetentionRoleId {
  return (
    value === "sales" ||
    value === "sns" ||
    value === "office" ||
    value === "executive" ||
    value === "freelance" ||
    value === "other"
  );
}

function isIntegrationId(value: unknown): value is RetentionIntegrationId {
  return (
    value === "google" ||
    value === "dropbox" ||
    value === "x" ||
    value === "email" ||
    value === "calendar"
  );
}

function normalizeState(raw: Partial<RetentionState> | null | undefined): RetentionState {
  const base = structuredClone(DEFAULT_RETENTION_STATE);
  if (!raw || typeof raw !== "object") return base;

  const wizardRaw: Partial<RetentionWizardProfile> =
    raw.wizard && typeof raw.wizard === "object" ? raw.wizard : {};
  const preferredTasks = Array.isArray(wizardRaw.preferredTasks)
    ? wizardRaw.preferredTasks.filter(
        (id): id is OnboardingTaskId => typeof id === "string",
      )
    : base.wizard.preferredTasks;

  const integrations = Array.isArray(wizardRaw.integrations)
    ? wizardRaw.integrations.filter(isIntegrationId)
    : [];

  const dayPlanMap = new Map<RetentionDayId, RetentionDayProgress>();
  for (const item of defaultDayPlan()) dayPlanMap.set(item.day, item);
  if (Array.isArray(raw.dayPlan)) {
    for (const item of raw.dayPlan) {
      if (!item || typeof item.day !== "number") continue;
      if (item.day < 1 || item.day > 7) continue;
      dayPlanMap.set(item.day as RetentionDayId, {
        day: item.day as RetentionDayId,
        completedAt: typeof item.completedAt === "string" ? item.completedAt : null,
        skippedAt: typeof item.skippedAt === "string" ? item.skippedAt : null,
      });
    }
  }

  return {
    version: 1,
    wizard: {
      workDescription:
        typeof wizardRaw.workDescription === "string" ? wizardRaw.workDescription : "",
      company: typeof wizardRaw.company === "string" ? wizardRaw.company : "",
      roleId: isRoleId(wizardRaw.roleId) ? wizardRaw.roleId : "sales",
      preferredTasks: preferredTasks.length > 0 ? preferredTasks : ["sales_material"],
      integrations,
      completedAt:
        typeof wizardRaw.completedAt === "string" ? wizardRaw.completedAt : null,
    },
    dayPlan: RETENTION_DAY_PLAN.map((d) => dayPlanMap.get(d.day)!),
    survey: raw.survey && typeof raw.survey === "object" ? (raw.survey as RetentionSurveyAnswers) : null,
    surveyDismissedAt:
      typeof raw.surveyDismissedAt === "string" ? raw.surveyDismissedAt : null,
    successDayKeys: Array.isArray(raw.successDayKeys)
      ? raw.successDayKeys.filter((v): v is string => typeof v === "string")
      : [],
    cohort: {
      retainedDay7:
        typeof raw.cohort?.retainedDay7 === "boolean" ? raw.cohort.retainedDay7 : null,
      retainedDay14:
        typeof raw.cohort?.retainedDay14 === "boolean" ? raw.cohort.retainedDay14 : null,
      retainedDay30:
        typeof raw.cohort?.retainedDay30 === "boolean" ? raw.cohort.retainedDay30 : null,
      firstActiveAt:
        typeof raw.cohort?.firstActiveAt === "string" ? raw.cohort.firstActiveAt : null,
      lastActiveAt:
        typeof raw.cohort?.lastActiveAt === "string" ? raw.cohort.lastActiveAt : null,
      activeDayKeys: Array.isArray(raw.cohort?.activeDayKeys)
        ? raw.cohort.activeDayKeys.filter((v): v is string => typeof v === "string")
        : [],
    },
    notificationsSent:
      raw.notificationsSent && typeof raw.notificationsSent === "object"
        ? raw.notificationsSent
        : {},
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
  };
}

export function loadRetentionState(): RetentionState {
  if (canUseStorage()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeState(memoryState());
      const parsed = JSON.parse(raw) as Partial<RetentionState>;
      const next = normalizeState(parsed);
      (globalThis as MemoryScope).__atlasRetentionState = next;
      return next;
    } catch {
      return normalizeState(memoryState());
    }
  }
  return normalizeState(memoryState());
}

export function saveRetentionState(patch: Partial<RetentionState>): RetentionState {
  const current = loadRetentionState();
  const next = normalizeState({
    ...current,
    ...patch,
    wizard: patch.wizard ? { ...current.wizard, ...patch.wizard } : current.wizard,
    cohort: patch.cohort ? { ...current.cohort, ...patch.cohort } : current.cohort,
    notificationsSent: patch.notificationsSent
      ? { ...current.notificationsSent, ...patch.notificationsSent }
      : current.notificationsSent,
    updatedAt: new Date().toISOString(),
  });
  (globalThis as MemoryScope).__atlasRetentionState = next;
  if (canUseStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota
    }
  }
  return next;
}

export function resetRetentionStateForTests(): void {
  (globalThis as MemoryScope).__atlasRetentionState = structuredClone(
    DEFAULT_RETENTION_STATE,
  );
  if (canUseStorage()) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function saveWizardProfile(
  input: Omit<RetentionWizardProfile, "completedAt"> & { completedAt?: string | null },
): RetentionState {
  return saveRetentionState({
    wizard: {
      ...input,
      completedAt: input.completedAt ?? new Date().toISOString(),
    },
  });
}

export function markRetentionDayComplete(
  day: RetentionDayId,
  at: string = new Date().toISOString(),
): RetentionState {
  const state = loadRetentionState();
  const dayPlan = state.dayPlan.map((item) =>
    item.day === day && !item.completedAt
      ? { ...item, completedAt: at, skippedAt: null }
      : item,
  );
  return saveRetentionState({ dayPlan });
}

export function markDailySuccess(at: Date = new Date()): RetentionState {
  const key = at.toISOString().slice(0, 10);
  const state = loadRetentionState();
  const successDayKeys = state.successDayKeys.includes(key)
    ? state.successDayKeys
    : [...state.successDayKeys, key];
  const activeDayKeys = state.cohort.activeDayKeys.includes(key)
    ? state.cohort.activeDayKeys
    : [...state.cohort.activeDayKeys, key];
  return saveRetentionState({
    successDayKeys,
    cohort: {
      ...state.cohort,
      activeDayKeys,
      firstActiveAt: state.cohort.firstActiveAt ?? at.toISOString(),
      lastActiveAt: at.toISOString(),
    },
  });
}

export function saveRetentionSurvey(answers: RetentionSurveyAnswers): RetentionState {
  return saveRetentionState({ survey: answers, surveyDismissedAt: null });
}

export function dismissRetentionSurvey(
  at: string = new Date().toISOString(),
): RetentionState {
  return saveRetentionState({ surveyDismissedAt: at });
}

export function shouldShowRetentionSurvey(
  state: RetentionState = loadRetentionState(),
  activationCompleted: boolean,
): boolean {
  if (!activationCompleted) return false;
  if (state.survey) return false;
  if (state.surveyDismissedAt) return false;
  return true;
}
