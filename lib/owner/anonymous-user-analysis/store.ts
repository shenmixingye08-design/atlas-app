import type { AnonymousUsageEvent } from "./types";

type EventBucket = AnonymousUsageEvent[];

function getBucket(): EventBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAnonymousUserAnalysisStore?: EventBucket;
  };

  if (!globalScope.__atlasAnonymousUserAnalysisStore) {
    globalScope.__atlasAnonymousUserAnalysisStore = [];
  }

  return globalScope.__atlasAnonymousUserAnalysisStore;
}

export function recordAnonymousUsageEvent(
  event: AnonymousUsageEvent,
): AnonymousUsageEvent {
  getBucket().push(event);
  return event;
}

export function listAnonymousUsageEvents(): AnonymousUsageEvent[] {
  return [...getBucket()];
}

export function hasAnonymousUsageRecords(): boolean {
  return getBucket().length > 0;
}

export function resetAnonymousUserAnalysisStore(): void {
  getBucket().length = 0;
}

export function seedAnonymousUsageEvents(
  events: readonly AnonymousUsageEvent[],
): void {
  getBucket().push(...events);
}
