import { randomUUID } from "node:crypto";

import { findEventByDedupe, getRevenueMaxState, setRevenueMaxState } from "./store";
import type {
  FirstUsecaseId,
  PainChoice,
  RevenueMaxEvent,
  RevenueMaxEventName,
  RevenueMaxUserState,
} from "./types";

export function recordUserEvent(input: {
  userId: string;
  eventName: RevenueMaxEventName;
  dedupeKey: string;
  metadata?: RevenueMaxEvent["metadata"];
  patch?: Partial<RevenueMaxUserState>;
}): { inserted: boolean } {
  const existing = findEventByDedupe(input.userId, input.dedupeKey);
  if (existing) return { inserted: false };
  const current = getRevenueMaxState(input.userId);
  const event: RevenueMaxEvent = {
    eventId: `rm_${randomUUID()}`,
    eventName: input.eventName,
    occurredAt: new Date().toISOString(),
    userId: input.userId,
    dedupeKey: input.dedupeKey,
    metadata: input.metadata ?? {},
  };
  setRevenueMaxState({
    ...current,
    ...input.patch,
    userId: input.userId,
    events: [event, ...current.events],
  });
  return { inserted: true };
}

export function applyOnboardingStarted(userId: string): void {
  const current = getRevenueMaxState(userId);
  recordUserEvent({
    userId,
    eventName: "onboarding_started",
    dedupeKey: `onboarding_started:${userId}`,
    patch: {
      onboardingStartedAt: current.onboardingStartedAt ?? new Date().toISOString(),
    },
  });
}

export function applyUsecaseSelected(
  userId: string,
  pain: PainChoice,
  usecase: FirstUsecaseId,
): void {
  recordUserEvent({
    userId,
    eventName: "first_usecase_selected",
    dedupeKey: `first_usecase_selected:${userId}`,
    metadata: { pain, usecase },
    patch: { pain, usecase },
  });
}

export function applyFirstRequest(userId: string, usecase: FirstUsecaseId): void {
  const current = getRevenueMaxState(userId);
  recordUserEvent({
    userId,
    eventName: "first_request_started",
    dedupeKey: `first_request_started:${userId}`,
    metadata: { usecase },
    patch: {
      firstRequestAt: current.firstRequestAt ?? new Date().toISOString(),
    },
  });
}

export function applyFirstSuccess(userId: string, summary: string): void {
  const current = getRevenueMaxState(userId);
  if (current.firstSuccessAt) return;
  recordUserEvent({
    userId,
    eventName: "first_request_succeeded",
    dedupeKey: `first_request_succeeded:${userId}`,
    metadata: { summary: summary.slice(0, 120) },
    patch: {
      firstSuccessAt: new Date().toISOString(),
      lastValueAt: new Date().toISOString(),
      lastSuccessSummary: summary.slice(0, 200),
      lastFailMessage: null,
    },
  });
}

export function applyValueTouch(userId: string, summary?: string | null): void {
  const current = getRevenueMaxState(userId);
  setRevenueMaxState({
    ...current,
    lastValueAt: new Date().toISOString(),
    lastSuccessSummary: summary?.slice(0, 200) ?? current.lastSuccessSummary,
  });
}

export function applyFirstFail(userId: string, message: string): void {
  recordUserEvent({
    userId,
    eventName: "first_request_failed",
    dedupeKey: `first_request_failed:${userId}:${message.slice(0, 40)}`,
    metadata: { message: message.slice(0, 160) },
    patch: {
      firstFailAt: new Date().toISOString(),
      lastFailMessage: message.slice(0, 200),
    },
  });
}
