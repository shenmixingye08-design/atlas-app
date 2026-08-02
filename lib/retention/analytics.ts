export type RetentionEventName =
  | "retention_wizard_completed"
  | "retention_quick_win_started"
  | "retention_day_completed"
  | "retention_survey_submitted"
  | "retention_daily_success"
  | "retention_home_bootstrap_clicked"
  | "retention_suggestion_clicked"
  | "retention_cohort_snapshot";

export type RetentionAnalyticsEvent = {
  name: RetentionEventName;
  at: string;
  props?: Record<string, string | number | boolean | null | undefined>;
};

type MemoryScope = typeof globalThis & {
  __atlasRetentionEvents?: RetentionAnalyticsEvent[];
};

function buffer(): RetentionAnalyticsEvent[] {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasRetentionEvents) scope.__atlasRetentionEvents = [];
  return scope.__atlasRetentionEvents;
}

export function trackRetentionEvent(
  name: RetentionEventName,
  props?: RetentionAnalyticsEvent["props"],
): void {
  const event: RetentionAnalyticsEvent = {
    name,
    at: new Date().toISOString(),
    props,
  };
  buffer().push(event);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("atlas:retention", { detail: event }));
  }
}

export function listRetentionEventsForTests(): RetentionAnalyticsEvent[] {
  return [...buffer()];
}

export function resetRetentionAnalyticsForTests(): void {
  (globalThis as MemoryScope).__atlasRetentionEvents = [];
}
