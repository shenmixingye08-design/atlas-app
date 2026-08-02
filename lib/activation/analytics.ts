/**
 * Activation funnel analytics.
 * Never send request body / personal content — ids and counters only.
 */

export type ActivationEventName =
  | "signup_completed"
  | "first_experience_started"
  | "template_selected"
  | "automation_draft_created"
  | "first_test_run_started"
  | "first_test_run_failed"
  | "first_artifact_created"
  | "first_artifact_downloaded"
  | "next_run_confirmed"
  | "first_experience_completed"
  | "activation_step_viewed"
  | "activation_retry_clicked"
  | "activation_skipped";

export type ActivationEventPayload = Record<
  string,
  string | number | boolean | null | undefined
>;

type StoredEvent = {
  name: ActivationEventName;
  payload: ActivationEventPayload;
  at: string;
};

function getBuffer(): StoredEvent[] {
  const g = globalThis as typeof globalThis & {
    __atlasActivationEvents?: StoredEvent[];
  };
  if (!g.__atlasActivationEvents) g.__atlasActivationEvents = [];
  return g.__atlasActivationEvents;
}

export function resetActivationAnalyticsForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasActivationEvents?: StoredEvent[];
  };
  g.__atlasActivationEvents = [];
}

export function listActivationEventsForTests(): StoredEvent[] {
  return [...getBuffer()];
}

export function trackActivationEvent(
  name: ActivationEventName,
  payload: ActivationEventPayload = {},
): void {
  try {
    // Strip accidental content fields if callers pass them.
    const safe: ActivationEventPayload = { ...payload };
    delete safe.content;
    delete safe.contentNotes;
    delete safe.notes;
    delete safe.body;
    delete safe.assignment;

    const entry: StoredEvent = {
      name,
      payload: safe,
      at: new Date().toISOString(),
    };
    getBuffer().push(entry);
    if (getBuffer().length > 500) {
      getBuffer().splice(0, getBuffer().length - 500);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("atlas:activation", { detail: entry }),
      );
    }
  } catch {
    // never throw
  }
}
