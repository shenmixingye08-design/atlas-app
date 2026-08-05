export type ValueAnalyticsEventName =
  | "value_home_viewed"
  | "value_roi_viewed"
  | "value_pitch_dismissed"
  | "value_meter_tab_changed"
  | "value_completed_work_opened"
  | "value_pricing_blurb_viewed";

export type ValueAnalyticsEvent = {
  name: ValueAnalyticsEventName;
  at: string;
  props?: Record<string, string | number | boolean | null | undefined>;
};

type MemoryScope = typeof globalThis & {
  __atlasValueEvents?: ValueAnalyticsEvent[];
};

function buffer(): ValueAnalyticsEvent[] {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasValueEvents) scope.__atlasValueEvents = [];
  return scope.__atlasValueEvents;
}

export function trackValueEvent(
  name: ValueAnalyticsEventName,
  props?: ValueAnalyticsEvent["props"],
): void {
  const event: ValueAnalyticsEvent = {
    name,
    at: new Date().toISOString(),
    props,
  };
  buffer().push(event);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("atlas:value", { detail: event }));
  }
}

export function listValueEventsForTests(): ValueAnalyticsEvent[] {
  return [...buffer()];
}

export function resetValueAnalyticsForTests(): void {
  (globalThis as MemoryScope).__atlasValueEvents = [];
}

export function summarizeValueAnalytics(snapshot: {
  roiMultiple: number | null;
  monthMinutesSaved: number;
  automationCount: number;
  memoryApplyCount: number;
  deliverableCount: number;
}): {
  roi: number | null;
  minutesSaved: number;
  automationRate: number;
  memoryRate: number;
  deliverableRate: number;
} {
  const base = Math.max(
    1,
    snapshot.automationCount +
      snapshot.memoryApplyCount +
      snapshot.deliverableCount,
  );
  return {
    roi: snapshot.roiMultiple,
    minutesSaved: snapshot.monthMinutesSaved,
    automationRate: Math.round((snapshot.automationCount / base) * 100),
    memoryRate: Math.round((snapshot.memoryApplyCount / base) * 100),
    deliverableRate: Math.round((snapshot.deliverableCount / base) * 100),
  };
}
