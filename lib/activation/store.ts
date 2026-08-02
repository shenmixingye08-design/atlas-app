"use client";

import type { ActivationProgressState } from "@/lib/activation/types";
import { WEEKLY_REPORT_TEMPLATE_ID } from "@/lib/activation/weekly-report-template";
import { getOnboardingState } from "@/lib/onboarding/store";

const STORAGE_KEY = "atlas-activation-weekly-report-v1";

export const DEFAULT_ACTIVATION_STATE: ActivationProgressState = {
  version: 1,
  templateId: WEEKLY_REPORT_TEMPLATE_ID,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  automationId: null,
  runId: null,
  artifactUrl: null,
  stepsCompleted: 0,
  retryCount: 0,
};

type MemoryScope = typeof globalThis & {
  __atlasActivationState?: ActivationProgressState;
};

function memoryState(): ActivationProgressState {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasActivationState) {
    scope.__atlasActivationState = { ...DEFAULT_ACTIVATION_STATE };
  }
  return scope.__atlasActivationState;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadActivationState(): ActivationProgressState {
  if (canUseStorage()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...memoryState() };
      const parsed = JSON.parse(raw) as Partial<ActivationProgressState>;
      const next = {
        ...DEFAULT_ACTIVATION_STATE,
        ...parsed,
        version: 1 as const,
        templateId: WEEKLY_REPORT_TEMPLATE_ID,
      };
      (globalThis as MemoryScope).__atlasActivationState = next;
      return next;
    } catch {
      return { ...memoryState() };
    }
  }
  return { ...memoryState() };
}

export function saveActivationState(
  patch: Partial<ActivationProgressState>,
): ActivationProgressState {
  const next: ActivationProgressState = {
    ...loadActivationState(),
    ...patch,
    version: 1,
    templateId: WEEKLY_REPORT_TEMPLATE_ID,
  };
  (globalThis as MemoryScope).__atlasActivationState = next;
  if (canUseStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota
    }
  }
  return next;
}

export function resetActivationStateForTests(): void {
  (globalThis as MemoryScope).__atlasActivationState = {
    ...DEFAULT_ACTIVATION_STATE,
  };
  if (canUseStorage()) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function markActivationStarted(): ActivationProgressState {
  const current = loadActivationState();
  return saveActivationState({
    startedAt: current.startedAt ?? new Date().toISOString(),
    skippedAt: null,
  });
}

export function markActivationCompleted(input: {
  automationId: string;
  runId: string;
  artifactUrl: string;
}): ActivationProgressState {
  return saveActivationState({
    completedAt: new Date().toISOString(),
    automationId: input.automationId,
    runId: input.runId,
    artifactUrl: input.artifactUrl,
    stepsCompleted: 4,
    skippedAt: null,
  });
}

export function markActivationSkipped(): ActivationProgressState {
  return saveActivationState({
    skippedAt: new Date().toISOString(),
  });
}

export function incrementActivationRetry(): number {
  const current = loadActivationState();
  const retryCount = current.retryCount + 1;
  saveActivationState({ retryCount });
  return retryCount;
}

/**
 * Show activation when onboarding is done, activation not completed,
 * and user has not permanently finished the first win.
 * Soft skip still allows home CTA; auto-open only when not skipped.
 */
export function shouldAutoOpenActivation(): boolean {
  const onboarding = getOnboardingState();
  if (!onboarding.completedOnboarding) return false;
  const state = loadActivationState();
  if (state.completedAt) return false;
  if (state.skippedAt) return false;
  return true;
}

export function shouldOfferActivationCta(): boolean {
  const state = loadActivationState();
  return !state.completedAt;
}

export function isActivationCompleted(): boolean {
  return Boolean(loadActivationState().completedAt);
}
