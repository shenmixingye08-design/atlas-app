/**
 * First-value funnel analytics (client + durable localStorage).
 * Never blocks UX.
 */

export type FirstValueEventName =
  | "signup_landed"
  | "first_value_home_viewed"
  | "first_value_candidate_selected"
  | "first_automation_started"
  | "first_automation_created"
  | "first_run_started"
  | "first_deliverable_ready"
  | "first_download"
  | "first_value_completed"
  | "day7_active"
  | "day30_active"
  | "automation_rate_snapshot"
  | "retention_snapshot";

export type FirstValueEventPayload = Record<
  string,
  string | number | boolean | null | undefined
>;

type StoredEvent = {
  name: FirstValueEventName;
  payload: FirstValueEventPayload;
  at: string;
};

const STORAGE_KEY = "atlas.firstValue.analytics.v1";
const FUNNEL_KEY = "atlas.firstValue.funnel.v1";

export type FirstValueFunnelState = {
  registeredAt: string | null;
  firstAutomationAt: string | null;
  firstDeliverableAt: string | null;
  firstDownloadAt: string | null;
  firstValueCompletedAt: string | null;
  lastActiveAt: string | null;
};

function emptyFunnel(): FirstValueFunnelState {
  return {
    registeredAt: null,
    firstAutomationAt: null,
    firstDeliverableAt: null,
    firstDownloadAt: null,
    firstValueCompletedAt: null,
    lastActiveAt: null,
  };
}

function getBuffer(): StoredEvent[] {
  const g = globalThis as typeof globalThis & {
    __atlasFirstValueEvents?: StoredEvent[];
  };
  if (!g.__atlasFirstValueEvents) g.__atlasFirstValueEvents = [];
  return g.__atlasFirstValueEvents;
}

function readFunnel(): FirstValueFunnelState {
  if (typeof window === "undefined") return emptyFunnel();
  try {
    const raw = window.localStorage.getItem(FUNNEL_KEY);
    if (!raw) return emptyFunnel();
    return { ...emptyFunnel(), ...(JSON.parse(raw) as FirstValueFunnelState) };
  } catch {
    return emptyFunnel();
  }
}

function writeFunnel(next: FirstValueFunnelState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FUNNEL_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function persistEvent(entry: StoredEvent): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: StoredEvent[] = raw ? (JSON.parse(raw) as StoredEvent[]) : [];
    list.push(entry);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.slice(-200)),
    );
  } catch {
    // ignore
  }
}

export function resetFirstValueAnalyticsForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasFirstValueEvents?: StoredEvent[];
  };
  g.__atlasFirstValueEvents = [];
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(FUNNEL_KEY);
  }
}

export function listFirstValueEventsForTests(): StoredEvent[] {
  return [...getBuffer()];
}

export function getFirstValueFunnelState(): FirstValueFunnelState {
  return readFunnel();
}

export function trackFirstValueEvent(
  name: FirstValueEventName,
  payload: FirstValueEventPayload = {},
): void {
  try {
    const at = new Date().toISOString();
    const entry: StoredEvent = { name, payload, at };
    getBuffer().push(entry);
    if (getBuffer().length > 500) getBuffer().splice(0, getBuffer().length - 500);
    persistEvent(entry);

    const funnel = readFunnel();
    funnel.lastActiveAt = at;
    if (name === "signup_landed" && !funnel.registeredAt) {
      funnel.registeredAt = at;
    }
    if (
      (name === "first_automation_created" ||
        name === "first_automation_started") &&
      !funnel.firstAutomationAt
    ) {
      funnel.firstAutomationAt = at;
    }
    if (name === "first_deliverable_ready" && !funnel.firstDeliverableAt) {
      funnel.firstDeliverableAt = at;
    }
    if (name === "first_download" && !funnel.firstDownloadAt) {
      funnel.firstDownloadAt = at;
    }
    if (name === "first_value_completed" && !funnel.firstValueCompletedAt) {
      funnel.firstValueCompletedAt = at;
    }
    writeFunnel(funnel);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("atlas:first-value", { detail: entry }),
      );
    }
  } catch {
    // never throw
  }
}

/** Retention helpers — estimated from local funnel timestamps. */
export function computeRetentionFlags(
  nowMs = Date.now(),
): { day7: boolean; day30: boolean } {
  const funnel = readFunnel();
  if (!funnel.registeredAt || !funnel.lastActiveAt) {
    return { day7: false, day30: false };
  }
  const registered = Date.parse(funnel.registeredAt);
  const last = Date.parse(funnel.lastActiveAt);
  if (!Number.isFinite(registered) || !Number.isFinite(last)) {
    return { day7: false, day30: false };
  }
  const ageDays = (nowMs - registered) / (24 * 60 * 60 * 1000);
  const activeRecently =
    nowMs - last <= 2 * 24 * 60 * 60 * 1000; // active within 2 days
  return {
    day7: ageDays >= 7 && activeRecently,
    day30: ageDays >= 30 && activeRecently,
  };
}
