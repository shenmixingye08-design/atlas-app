/**
 * Activation funnel analytics — complements Automation First events.
 * Never blocks UX.
 */

export type FirstValueEventName =
  | "registration_home_viewed"
  | "empty_home_viewed"
  | "quick_start_preset_clicked"
  | "quick_start_submitted"
  | "automation_created"
  | "first_try_now_clicked"
  | "first_deliverable_ready"
  | "first_download"
  | "day7_return"
  | "day30_return"
  | "automation_rate_snapshot"
  | "memory_rate_snapshot";

export type FirstValueEventPayload = Record<
  string,
  string | number | boolean | null | undefined
>;

type StoredEvent = {
  name: FirstValueEventName;
  payload: FirstValueEventPayload;
  at: string;
};

function getBuffer(): StoredEvent[] {
  const g = globalThis as typeof globalThis & {
    __atlasFirstValueEvents?: StoredEvent[];
  };
  if (!g.__atlasFirstValueEvents) g.__atlasFirstValueEvents = [];
  return g.__atlasFirstValueEvents;
}

export function resetFirstValueAnalyticsForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasFirstValueEvents?: StoredEvent[];
  };
  g.__atlasFirstValueEvents = [];
}

export function listFirstValueEventsForTests(): StoredEvent[] {
  return [...getBuffer()];
}

export function trackFirstValueEvent(
  name: FirstValueEventName,
  payload: FirstValueEventPayload = {},
): void {
  try {
    const entry: StoredEvent = {
      name,
      payload,
      at: new Date().toISOString(),
    };
    getBuffer().push(entry);
    if (getBuffer().length > 500) getBuffer().splice(0, getBuffer().length - 500);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("atlas:first-value", { detail: entry }),
      );
      try {
        const key = "atlas.first-value.events";
        const raw = window.sessionStorage.getItem(key);
        const prev = raw ? (JSON.parse(raw) as StoredEvent[]) : [];
        const next = [...prev, entry].slice(-100);
        window.sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
    }
  } catch {
    // never throw
  }
}
