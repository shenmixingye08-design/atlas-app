import "server-only";

import { createHash } from "node:crypto";

import type { BetaOpsEvent, BetaOpsEventKind } from "./types";

type Store = {
  events: BetaOpsEvent[];
};

const MAX_EVENTS = 5_000;

function getStore(): Store {
  const scope = globalThis as typeof globalThis & {
    __minervotBetaOpsEvents?: Store;
  };
  if (!scope.__minervotBetaOpsEvents) {
    scope.__minervotBetaOpsEvents = { events: [] };
  }
  return scope.__minervotBetaOpsEvents;
}

export function resetBetaOpsEventsForTests(): void {
  getStore().events = [];
}

export function hashAssignment(assignment: string | null | undefined): string | null {
  const text = assignment?.trim();
  if (!text) return null;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function recordBetaOpsEvent(input: {
  kind: BetaOpsEventKind;
  userId?: string | null;
  jobId?: string | null;
  durationMs?: number | null;
  assignment?: string | null;
  assignmentHash?: string | null;
}): void {
  const store = getStore();
  store.events.push({
    id: `bop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    at: new Date().toISOString(),
    userId: input.userId ?? null,
    jobId: input.jobId ?? null,
    durationMs:
      typeof input.durationMs === "number" && input.durationMs >= 0
        ? input.durationMs
        : null,
    assignmentHash:
      input.assignmentHash ?? hashAssignment(input.assignment ?? null),
  });
  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS);
  }
}

export function listBetaOpsEvents(): readonly BetaOpsEvent[] {
  return getStore().events;
}
