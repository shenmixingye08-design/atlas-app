import type { ActivationEventPayload, ActivationProgress } from "./types";

type Bucket = {
  progress: Map<string, ActivationProgress>;
  events: Map<string, ActivationEventPayload[]>;
  keys: Map<string, Set<string>>;
  hydrated: Set<string>;
};

function getBucket(): Bucket {
  const g = globalThis as typeof globalThis & { __atlasActivation?: Bucket };
  if (!g.__atlasActivation) {
    g.__atlasActivation = {
      progress: new Map(),
      events: new Map(),
      keys: new Map(),
      hydrated: new Set(),
    };
  }
  return g.__atlasActivation;
}

export function resetActivationStoreForTests(): void {
  const g = globalThis as typeof globalThis & { __atlasActivation?: Bucket };
  g.__atlasActivation = {
    progress: new Map(),
    events: new Map(),
    keys: new Map(),
    hydrated: new Set(),
  };
}

export function readActivationProgress(
  userId: string,
): ActivationProgress | null {
  return getBucket().progress.get(userId) ?? null;
}

export function writeActivationProgress(
  userId: string,
  progress: ActivationProgress,
): ActivationProgress {
  getBucket().progress.set(userId, progress);
  return progress;
}

export function listActivationEvents(userId: string): ActivationEventPayload[] {
  return [...(getBucket().events.get(userId) ?? [])];
}

export function listAllActivationEvents(): ActivationEventPayload[] {
  return [...getBucket().events.values()].flat();
}

export function hasActivationIdempotencyKey(
  userId: string,
  key: string,
): boolean {
  return getBucket().keys.get(userId)?.has(key) === true;
}

export function rememberActivationEvent(
  userId: string,
  event: ActivationEventPayload,
): boolean {
  const bucket = getBucket();
  const keys = bucket.keys.get(userId) ?? new Set<string>();
  if (keys.has(event.idempotencyKey)) return false;
  keys.add(event.idempotencyKey);
  bucket.keys.set(userId, keys);
  const list = bucket.events.get(userId) ?? [];
  list.push(event);
  if (list.length > 400) list.splice(0, list.length - 400);
  bucket.events.set(userId, list);
  return true;
}

export function isActivationHydrated(userId: string): boolean {
  return getBucket().hydrated.has(userId);
}

export function markActivationHydrated(userId: string): void {
  getBucket().hydrated.add(userId);
}

export function replaceActivationEvents(
  userId: string,
  events: ActivationEventPayload[],
): void {
  const bucket = getBucket();
  bucket.events.set(userId, events);
  bucket.keys.set(userId, new Set(events.map((event) => event.idempotencyKey)));
}
