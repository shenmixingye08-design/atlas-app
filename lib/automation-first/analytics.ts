/**
 * Lightweight client analytics for Automation First UI.
 * Never blocks UX; swallows failures.
 */

export type AutomationFirstEventName =
  | "home_viewed"
  | "primary_automation_cta_clicked"
  | "one_time_request_clicked"
  | "automation_template_selected"
  | "automation_create_completed"
  | "approval_completed"
  | "attention_item_opened"
  | "run_detail_opened"
  | "artifact_opened"
  | "memory_candidate_approved"
  | "workflow_suggestion_applied"
  | "navigation_used"
  | "empty_state_cta_clicked"
  | "error_recovery_started"
  | "mobile_bottom_nav_used"
  | "home_primary_one_time_clicked"
  | "home_primary_automation_clicked";

export type AutomationFirstEventPayload = Record<
  string,
  string | number | boolean | null | undefined
>;

type StoredEvent = {
  name: AutomationFirstEventName;
  payload: AutomationFirstEventPayload;
  at: string;
};

function getBuffer(): StoredEvent[] {
  const g = globalThis as typeof globalThis & {
    __atlasAutomationFirstEvents?: StoredEvent[];
  };
  if (!g.__atlasAutomationFirstEvents) g.__atlasAutomationFirstEvents = [];
  return g.__atlasAutomationFirstEvents;
}

export function resetAutomationFirstAnalyticsForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasAutomationFirstEvents?: StoredEvent[];
  };
  g.__atlasAutomationFirstEvents = [];
}

export function listAutomationFirstEventsForTests(): StoredEvent[] {
  return [...getBuffer()];
}

export function trackAutomationFirstEvent(
  name: AutomationFirstEventName,
  payload: AutomationFirstEventPayload = {},
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
        new CustomEvent("atlas:automation-first", { detail: entry }),
      );
    }
  } catch {
    // never throw from analytics
  }
}
