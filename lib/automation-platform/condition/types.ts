/**
 * Phase 4 — durable condition / event trigger evaluation types.
 */

export type ConditionTriggerProvider = "google_calendar";

export type ConditionMatchMode = "equals" | "contains";

export type CalendarEventTitleConditionFilter = {
  title: string;
  matchMode: ConditionMatchMode;
  calendarId?: string;
  lookbackDays?: number;
  lookaheadDays?: number;
};

export type ConditionEvaluationResult = {
  evaluated: true;
  conditionState: boolean;
  provider: ConditionTriggerProvider | string;
  eventType: string;
  matchedResourceIds: string[];
  /** Primary resource that should drive occurrenceKey when newly true */
  primaryResourceId: string | null;
  evidence: {
    eventIds: string[];
    titles: string[];
    evaluatedAt: string;
  };
};

export type ConditionEvaluationFailure = {
  evaluated: false;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
};

export type ConditionEvalOutcome =
  | ConditionEvaluationResult
  | ConditionEvaluationFailure;

export type AutomationTriggerState = {
  automationId: string;
  userId: string;
  triggerType: "condition" | "event";
  triggerVersion: number;
  lastEvaluatedAt: string | null;
  lastConditionState: boolean | null;
  lastTriggeredAt: string | null;
  lastOccurrenceKey: string | null;
  lastEventId: string | null;
  lastProviderResourceId: string | null;
  triggeredResourceIds: string[];
  evaluationLeaseOwner: string | null;
  evaluationLeaseUntil: string | null;
  lastEvaluationError: string | null;
  evaluationAttemptCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ConditionEdgeDecision =
  | {
      shouldTrigger: true;
      reason: "false_to_true" | "new_resource_while_true";
      resourceId: string;
      previousState: boolean | null;
      currentState: true;
    }
  | {
      shouldTrigger: false;
      reason:
        | "still_false"
        | "still_true_same_resources"
        | "true_to_false"
        | "open_run_blocks"
        | "missing_resource_id";
      previousState: boolean | null;
      currentState: boolean;
    };
